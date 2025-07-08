const { execSync } = require('child_process');
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

// Installation des dépendances Python au démarrage
function installPythonDeps() {
  try {
    console.log('Vérification des dépendances Python...');
    const requiredPackages = {
      'pdfminer.six': '20221105',
      'nltk': '3.8.1',
      'scikit-learn': '1.3.2',
      'python-dateutil': '2.8.2'
    };

    for (const [pkg, version] of Object.entries(requiredPackages)) {
      try {
        const importName = pkg === 'pdfminer.six' ? 'pdfminer' : 
                          pkg === 'python-dateutil' ? 'dateutil' : pkg.replace('-', '_');
        execSync(`python -c "import ${importName}"`);
        console.log(`${pkg} est déjà installé`);
      } catch {
        console.log(`Installation de ${pkg}==${version}...`);
        execSync(`pip install ${pkg}==${version}`, { stdio: 'inherit' });
      }
    }
    
    // Télécharger les données NLTK
    try {
      execSync('python -c "import nltk; nltk.download(\'stopwords\')"');
    } catch (error) {
      console.log('Téléchargement des stopwords NLTK...');
    }
  } catch (error) {
    console.error('Erreur lors de l\'installation des dépendances Python:', error);
    process.exit(1);
  }
}

installPythonDeps();

// Configuration de l'application Express
const app = express();
const allowedOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:5500'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  credentials: true
}));

app.options('*', cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configuration
const SECRET_KEY = process.env.SECRET_KEY || 'SRM_SM_SECRET_KEY_2025';
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Configuration de la base de données
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gestion_stages',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Créer un pool de connexions MySQL
const pool = mysql.createPool(dbConfig);

// Créer le répertoire uploads s'il n'existe pas
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configuration du stockage des fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Seuls les fichiers PDF sont acceptés'), false);
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Middleware d'authentification JWT
function authenticateJWT(requiredRole) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ message: 'Token d\'authentification manquant' });
      }

      const token = authHeader.split(' ')[1];
      const decoded = await promisify(jwt.verify)(token, SECRET_KEY);
      
      if (requiredRole && decoded.role !== requiredRole) {
        return res.status(403).json({ message: 'Accès non autorisé pour ce rôle' });
      }

      // Vérifier si l'utilisateur existe toujours en base
      const table = decoded.role === 'admin' ? 'Administrateur' : 'Candidat';
      const idField = decoded.role === 'admin' ? 'idAdmin' : 'idCandidat';
      
      const [rows] = await pool.query(
        `SELECT ${idField} FROM ${table} WHERE ${idField} = ?`, 
        [decoded.id]
      );

      if (rows.length === 0) {
        return res.status(403).json({ message: 'Utilisateur introuvable' });
      }

      req.user = decoded;
      next();
    } catch (err) {
      console.error('Erreur JWT:', err);
      return res.status(403).json({ message: 'Token invalide ou expiré' });
    }
  };
}

// Fonction utilitaire pour gérer les erreurs
function handleError(res, error, context) {
  console.error(`Erreur dans ${context}:`, error);
  const message = process.env.NODE_ENV === 'development' 
    ? `${context}: ${error.message}`
    : `Une erreur est survenue lors de ${context}`;
  
  res.status(500).json({ message });
}

// Routes pour les candidats

// Inscription candidat
app.post('/api/candidat/inscription', upload.fields([
  { name: 'cv', maxCount: 1 },
  { name: 'lettre', maxCount: 1 }
]), async (req, res) => {
  const { nom, prenom, email, motDePasse, telephone, adresse, etablissement, domaine, niveau } = req.body;
  
  if (!nom || !prenom || !email || !motDePasse || !etablissement || !domaine || !niveau) {
    return res.status(400).json({ message: 'Tous les champs obligatoires doivent être remplis' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    
    // Vérifier si l'email existe déjà
    const [existing] = await connection.query(
      'SELECT idCandidat FROM Candidat WHERE email = ?', 
      [email]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }

    // Hacher le mot de passe
    const hashedPassword = await bcrypt.hash(motDePasse, 10);
    
    // Insérer le nouveau candidat
    const [result] = await connection.query(
      `INSERT INTO Candidat (
        nom, prenom, email, motDePasse, telephone, adresse, 
        etablissement, domaine, niveau
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nom, prenom, email, hashedPassword, telephone || null, adresse || null,
        etablissement, domaine, niveau
      ]
    );

    res.status(201).json({ 
      message: 'Inscription réussie',
      id: result.insertId
    });
  } catch (err) {
    handleError(res, err, 'l\'inscription');
  } finally {
    if (connection) connection.release();
  }
});

// Connexion candidat
app.post('/api/candidat/login', async (req, res) => {
  const { email, motDePasse } = req.body;
  
  if (!email || !motDePasse) {
    return res.status(400).json({ message: 'Email et mot de passe requis' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    const [users] = await connection.query(
      'SELECT * FROM Candidat WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(motDePasse, user.motDePasse);
    
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    // Générer le token JWT
    const token = jwt.sign(
      { 
        id: user.idCandidat, 
        role: 'candidat',
        email: user.email,
        nom: user.nom,
        prenom: user.prenom
      }, 
      SECRET_KEY, 
      { expiresIn: '24h' }
    );

    // Retourner les infos utilisateur (sans le mot de passe)
    const userData = {
      id: user.idCandidat,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      etablissement: user.etablissement,
      domaine: user.domaine,
      niveau: user.niveau
    };

    res.json({ 
      token, 
      user: userData,
      expiresIn: 24 * 60 * 60 // 24 heures en secondes
    });
  } catch (err) {
    handleError(res, err, 'la connexion');
  } finally {
    if (connection) connection.release();
  }
});

// Soumettre une demande de stage
app.post(
  '/api/demande', 
  authenticateJWT('candidat'),
  upload.fields([
    { name: 'cv', maxCount: 1 },
    { name: 'lettre', maxCount: 1 }
  ]),
  async (req, res) => {
    const { domaine, etablissement, niveau, description } = req.body;
    const idCandidat = req.user.id;

    if (!domaine || !etablissement || !niveau) {
      return res.status(400).json({ message: 'Domaine, établissement et niveau sont obligatoires' });
    }

    if (!req.files['cv'] || !req.files['lettre']) {
      return res.status(400).json({ message: 'CV et lettre de motivation sont obligatoires' });
    }

    let connection;
    try {
      connection = await pool.getConnection();
      
      const cvPath = req.files['cv'][0].path;
      const lettrePath = req.files['lettre'][0].path;

      // Enregistrer la demande en base
      const [result] = await connection.query(
        `INSERT INTO DemandeStage (
          dateDepot, statut, fichiersCV, fichiersLettre, 
          idCandidat, domaine, etablissement, niveau, description
        ) VALUES (NOW(), 'En attente', ?, ?, ?, ?, ?, ?, ?)`,
        [
          cvPath, lettrePath, idCandidat, 
          domaine, etablissement, niveau, description || null
        ]
      );

      const idDemande = result.insertId;

      // Appeler le modèle ML en arrière-plan (ne pas bloquer la réponse)
      process.nextTick(async () => {
        let mlConnection;
        try {
          mlConnection = await pool.getConnection();
          const mlInput = JSON.stringify({
            domaine,
            cv_path: cvPath
          });

          execFile(
            'python', 
            [path.join(__dirname, 'ml', 'model.py'), mlInput],
            async (error, stdout, stderr) => {
              if (error) {
                console.error('Erreur modèle ML:', error, stderr);
                return;
              }

              try {
                const mlResult = JSON.parse(stdout);
                
                await mlConnection.query(
                  `UPDATE DemandeStage 
                   SET scoreML = ?, experienceML = ?, competencesML = ?
                   WHERE idDemande = ?`,
                  [
                    mlResult.score,
                    mlResult.experience,
                    mlResult.skills.join(','),
                    idDemande
                  ]
                );
              } catch (updateErr) {
                console.error('Erreur mise à jour ML:', updateErr);
              } finally {
                if (mlConnection) mlConnection.release();
              }
            }
          );
        } catch (err) {
          console.error('Erreur connexion ML:', err);
          if (mlConnection) mlConnection.release();
        }
      });

      res.status(201).json({ 
        message: 'Demande soumise avec succès. Analyse en cours...',
        idDemande
      });
    } catch (err) {
      handleError(res, err, 'la soumission de demande');
    } finally {
      if (connection) connection.release();
    }
  }
);

// Obtenir les demandes d'un candidat
app.get('/api/candidat/demandes', authenticateJWT('candidat'), async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [demandes] = await connection.query(
      `SELECT 
        idDemande, dateDepot, statut, scoreML, decisionRH, motifRejet, 
        fichiersCV, fichiersLettre, domaine, etablissement, niveau,
        experienceML, competencesML, description
       FROM DemandeStage 
       WHERE idCandidat = ?
       ORDER BY dateDepot DESC`,
      [req.user.id]
    );

    const demandesWithUrls = demandes.map(d => ({
      ...d,
      cvUrl: `/uploads/${path.basename(d.fichiersCV)}`,
      lettreUrl: `/uploads/${path.basename(d.fichiersLettre)}`,
      fichiersCV: undefined,
      fichiersLettre: undefined,
      competencesML: d.competencesML ? d.competencesML.split(',') : [],
      dateDepot: new Date(d.dateDepot).toISOString()
    }));

    res.json(demandesWithUrls);
  } catch (err) {
    handleError(res, err, 'la récupération des demandes');
  } finally {
    if (connection) connection.release();
  }
});

// Routes pour les administrateurs

// Connexion admin
app.post('/api/admin/login', async (req, res) => {
  const { email, motDePasse } = req.body;
  
  if (!email || !motDePasse) {
    return res.status(400).json({ message: 'Email et mot de passe requis' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    const [admins] = await connection.query(
      'SELECT * FROM Administrateur WHERE email = ?',
      [email]
    );

    if (admins.length === 0) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const admin = admins[0];
    const passwordMatch = await bcrypt.compare(motDePasse, admin.motDePasse);
    
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const token = jwt.sign(
      { 
        id: admin.idAdmin, 
        role: 'admin',
        email: admin.email,
        nom: admin.nom
      }, 
      SECRET_KEY, 
      { expiresIn: '24h' }
    );

    res.json({ 
      token,
      admin: {
        id: admin.idAdmin,
        nom: admin.nom,
        email: admin.email
      },
      expiresIn: 24 * 60 * 60 // 24 heures en secondes
    });
  } catch (err) {
    handleError(res, err, 'la connexion admin');
  } finally {
    if (connection) connection.release();
  }
});

// Lister toutes les demandes (admin)
app.get('/api/admin/demandes', authenticateJWT('admin'), async (req, res) => {
  let connection;
  try {
    const { statut, domaine, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    connection = await pool.getConnection();
    
    let query = `
      SELECT 
        d.idDemande, d.dateDepot, d.statut, d.scoreML, d.decisionRH, d.motifRejet,
        d.fichiersCV, d.fichiersLettre, d.domaine, d.etablissement, d.niveau,
        d.experienceML, d.competencesML, d.description,
        c.idCandidat, c.nom, c.prenom, c.email, c.telephone
      FROM DemandeStage d
      JOIN Candidat c ON d.idCandidat = c.idCandidat
    `;

    const params = [];
    const conditions = [];
    
    if (statut) {
      conditions.push('d.statut = ?');
      params.push(statut);
    }
    
    if (domaine) {
      conditions.push('d.domaine = ?');
      params.push(domaine);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY d.dateDepot DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [demandes] = await connection.query(query, params);

    // Requête pour le total
    const [total] = await connection.query(
      `SELECT COUNT(*) as total FROM DemandeStage d ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}`,
      params.slice(0, -2)
    );

    const demandesWithUrls = demandes.map(d => ({
      ...d,
      cvUrl: `/uploads/${path.basename(d.fichiersCV)}`,
      lettreUrl: `/uploads/${path.basename(d.fichiersLettre)}`,
      fichiersCV: undefined,
      fichiersLettre: undefined,
      competencesML: d.competencesML ? d.competencesML.split(',') : [],
      dateDepot: new Date(d.dateDepot).toISOString()
    }));

    res.json({
      demandes: demandesWithUrls,
      pagination: {
        total: total[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total[0].total / limit)
      }
    });
  } catch (err) {
    handleError(res, err, 'la récupération des demandes admin');
  } finally {
    if (connection) connection.release();
  }
});

// Mettre à jour une demande (admin)
app.put('/api/admin/demandes/:id', authenticateJWT('admin'), async (req, res) => {
  const { id } = req.params;
  const { decisionRH, motifRejet } = req.body;

  if (!decisionRH || !['Accepté', 'Rejeté', 'En attente'].includes(decisionRH)) {
    return res.status(400).json({ message: 'Décision invalide' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query(
      `UPDATE DemandeStage 
       SET decisionRH = ?, statut = ?, motifRejet = ?
       WHERE idDemande = ?`,
      [decisionRH, decisionRH, motifRejet || null, id]
    );

    res.json({ message: 'Décision mise à jour avec succès' });
  } catch (err) {
    handleError(res, err, 'la mise à jour de la demande');
  } finally {
    if (connection) connection.release();
  }
});

// Télécharger un fichier
app.get('/uploads/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(UPLOAD_DIR, filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ message: 'Fichier non trouvé' });
  }
});

// Servir les fichiers statiques du frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Route pour servir l'application frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Endpoint de vérification de santé
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'gestion_stages',
    version: '1.0.0'
  });
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: `Erreur de fichier: ${err.message}` });
  }
  
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'development' 
    ? err.message 
    : 'Une erreur est survenue';
  
  res.status(statusCode).json({ message });
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur SRM-SM démarré sur http://localhost:${PORT}`);
  console.log(`📊 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Dossier uploads: ${UPLOAD_DIR}`);
  console.log(`🗄️  Base de données: ${dbConfig.database}`);
});

// Gestion des arrêts propres
process.on('SIGTERM', () => {
  console.log('Fermeture du serveur...');
  pool.end();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Arrêt par Ctrl+C...');
  pool.end();
  process.exit(0);
});