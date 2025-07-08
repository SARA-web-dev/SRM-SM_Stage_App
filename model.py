import sys
import json
import re
import os
from pdfminer.high_level import extract_text
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.model_selection import train_test_split
import joblib
import nltk
from nltk.corpus import stopwords
from datetime import datetime
import numpy as np

# Télécharger les stopwords français si nécessaire
try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords')

STOPWORDS_FR = set(stopwords.words('french'))

# Domaines et compétences associées (base de données étendue)
DOMAINES_COMPETENCES = {
    'informatique': {
        'keywords': ['python', 'java', 'javascript', 'sql', 'html', 'css', 'react', 'angular', 'vue', 
                    'node', 'php', 'c++', 'c#', 'ruby', 'go', 'rust', 'swift', 'kotlin', 'scala',
                    'docker', 'kubernetes', 'git', 'github', 'gitlab', 'jenkins', 'aws', 'azure',
                    'mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch', 'apache', 'nginx',
                    'linux', 'windows', 'macos', 'android', 'ios', 'flutter', 'xamarin',
                    'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'scikit-learn',
                    'data science', 'big data', 'hadoop', 'spark', 'kafka', 'api', 'rest', 'graphql',
                    'microservices', 'devops', 'ci/cd', 'agile', 'scrum', 'kanban'],
        'weight': 1.0
    },
    'gestion': {
        'keywords': ['comptabilité', 'finance', 'management', 'marketing', 'budget', 'audit',
                    'contrôle de gestion', 'ressources humaines', 'stratégie', 'planification',
                    'excel', 'powerpoint', 'word', 'sap', 'erp', 'crm', 'business intelligence',
                    'analyse financière', 'reporting', 'kpi', 'tableau de bord', 'sage',
                    'communication', 'négociation', 'leadership', 'équipe', 'projet',
                    'qualité', 'iso', 'lean', 'six sigma', 'amélioration continue'],
        'weight': 1.0
    },
    'électricité et électromécanique': {
        'keywords': ['circuit', 'électronique', 'énergie', 'schéma', 'automate', 'plc',
                    'moteur', 'transformateur', 'alternateur', 'redresseur', 'onduleur',
                    'capteur', 'actionneur', 'régulation', 'asservissement', 'matlab',
                    'simulink', 'autocad', 'solidworks', 'catia', 'maintenance',
                    'hydraulique', 'pneumatique', 'mécanique', 'thermodynamique',
                    'électrotechnique', 'automatisme', 'robotique', 'instrumentation'],
        'weight': 1.0
    },
    'génie civil': {
        'keywords': ['construction', 'béton', 'architecture', 'planification', 'btp',
                    'structure', 'fondation', 'charpente', 'maçonnerie', 'géotechnique',
                    'topographie', 'autocad', 'revit', 'archicad', 'robot structural',
                    'étude de sol', 'voirie', 'assainissement', 'hydraulique urbaine',
                    'pont', 'tunnel', 'barrage', 'route', 'chemin de fer',
                    'métré', 'devis', 'planning', 'suivi de chantier', 'sécurité'],
        'weight': 1.0
    },
    'logistique et transport': {
        'keywords': ['supply chain', 'approvisionnement', 'stock', 'entrepôt', 'distribution',
                    'transport', 'logistique', 'wms', 'erp', 'planification', 'optimisation',
                    'douane', 'import', 'export', 'incoterms', 'transit', 'fret',
                    'manutention', 'emballage', 'traçabilité', 'qualité', 'lean',
                    'kanban', 'juste à temps', 'mrp', 'forecasting', 'demand planning'],
        'weight': 1.0
    },
    'ressources humaines': {
        'keywords': ['recrutement', 'formation', 'paie', 'droit du travail', 'sirh',
                    'gestion des talents', 'évaluation', 'performance', 'compétences',
                    'communication', 'relations sociales', 'négociation', 'médiation',
                    'coaching', 'développement personnel', 'leadership', 'management',
                    'psychologie', 'sociologie', 'entretien', 'assessment center'],
        'weight': 1.0
    }
}

# Données d'entraînement synthétiques pour le modèle
TRAINING_DATA = {
    'informatique': [
        "Développeur Python avec 3 ans d'expérience en Django et Flask. Maîtrise de SQL, Git, Docker.",
        "Ingénieur logiciel spécialisé en JavaScript, React, Node.js. Expérience en développement web.",
        "Data Scientist avec compétences en machine learning, TensorFlow, scikit-learn, Python.",
        "Administrateur système Linux, Docker, Kubernetes, AWS. DevOps et CI/CD.",
        "Développeur mobile Android/iOS, Flutter, React Native. Applications mobiles."
    ],
    'gestion': [
        "Contrôleur de gestion avec expertise en analyse financière, reporting, Excel avancé.",
        "Manager commercial avec expérience en négociation, CRM, développement business.",
        "Consultant en management, stratégie d'entreprise, amélioration des processus.",
        "Responsable marketing digital, SEO, SEM, réseaux sociaux, analytics.",
        "Auditeur interne avec maîtrise des normes ISO, contrôle qualité, audit financier."
    ],
    'électricité et électromécanique': [
        "Ingénieur électricien spécialisé en automatisme industriel, PLC, SCADA.",
        "Technicien en électronique de puissance, variateurs, moteurs électriques.",
        "Ingénieur en énergies renouvelables, photovoltaïque, éolien.",
        "Automaticien avec expertise en robotique industrielle, capteurs, actionneurs.",
        "Ingénieur maintenance électromécanique, diagnostic, réparation équipements."
    ],
    'génie civil': [
        "Ingénieur structure spécialisé en béton armé, calcul de structures, Robot Structural.",
        "Conducteur de travaux BTP, planification chantier, suivi qualité, sécurité.",
        "Ingénieur géotechnique, étude de sols, fondations, stabilité des ouvrages.",
        "Architecte avec maîtrise d'AutoCAD, Revit, conception architecturale.",
        "Ingénieur VRD, voirie, réseaux divers, assainissement, hydraulique urbaine."
    ],
    'logistique et transport': [
        "Responsable supply chain, optimisation des flux, gestion des stocks, WMS.",
        "Logisticien transport international, douane, incoterms, transit.",
        "Gestionnaire d'entrepôt, manutention, préparation commandes, traçabilité.",
        "Planificateur logistique, forecasting, MRP, optimisation des approvisionnements.",
        "Consultant en amélioration continue, lean manufacturing, kaizen."
    ],
    'ressources humaines': [
        "Responsable recrutement, sourcing candidats, entretiens, assessment.",
        "Gestionnaire paie, droit du travail, SIRH, administration du personnel.",
        "Consultant en formation, ingénierie pédagogique, développement compétences.",
        "DRH généraliste, relations sociales, négociation, management équipes.",
        "Coach professionnel, développement personnel, accompagnement carrière."
    ]
}

def extract_text_from_pdf(pdf_path):
    """Extrait le texte d'un fichier PDF"""
    try:
        if not os.path.exists(pdf_path):
            print(f"Erreur: Fichier {pdf_path} introuvable", file=sys.stderr)
            return ""
        
        text = extract_text(pdf_path)
        if not text or len(text.strip()) < 50:
            print(f"Attention: Texte extrait très court ({len(text)} caractères)", file=sys.stderr)
        
        return text
    except Exception as e:
        print(f"Erreur lecture PDF {pdf_path}: {e}", file=sys.stderr)
        return ""

def clean_text(text):
    """Nettoie et normalise le texte"""
    if not text:
        return ""
    
    # Convertir en minuscules
    text = text.lower()
    
    # Supprimer les caractères spéciaux mais garder les espaces
    text = re.sub(r'[^\w\s]', ' ', text)
    
    # Supprimer les espaces multiples
    text = re.sub(r'\s+', ' ', text)
    
    # Supprimer les mots très courts (moins de 3 caractères)
    words = [word for word in text.split() if len(word) >= 3]
    
    # Supprimer les stopwords français
    words = [word for word in words if word not in STOPWORDS_FR]
    
    return ' '.join(words)

def extract_experience_years(text):
    """Extrait le nombre d'années d'expérience du CV"""
    if not text:
        return 0
    
    text_lower = text.lower()
    experience_years = 0
    
    # Patterns pour détecter l'expérience
    patterns = [
        r'(\d+)\s*(?:ans?|années?)\s*(?:d[\'e]|de)?\s*(?:expérience|experience)',
        r'(?:expérience|experience)\s*(?:de|d[\'e])?\s*(\d+)\s*(?:ans?|années?)',
        r'(\d+)\s*(?:years?)\s*(?:of)?\s*(?:experience|exp)',
        r'(?:experience|exp)\s*(?:of)?\s*(\d+)\s*(?:years?)',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text_lower)
        if matches:
            years = [int(match) for match in matches if match.isdigit()]
            if years:
                experience_years = max(experience_years, max(years))
    
    # Alternative: compter les emplois/stages mentionnés
    if experience_years == 0:
        job_keywords = ['stage', 'emploi', 'poste', 'position', 'job', 'work', 'travail']
        job_count = sum(len(re.findall(rf'\b{keyword}\b', text_lower)) for keyword in job_keywords)
        experience_years = min(job_count, 5)  # Maximum 5 ans basé sur le nombre d'emplois
    
    return min(experience_years, 20)  # Limiter à 20 ans maximum

def extract_skills_for_domain(text, domaine):
    """Extrait les compétences pertinentes pour un domaine donné"""
    if not text or not domaine:
        return []
    
    text_clean = clean_text(text)
    domaine_clean = domaine.lower().strip()
    
    # Trouver le domaine correspondant
    domain_info = None
    for domain_key, info in DOMAINES_COMPETENCES.items():
        if domain_key in domaine_clean or domaine_clean in domain_key:
            domain_info = info
            break
    
    if not domain_info:
        # Domaine non reconnu, retourner une liste vide
        return []
    
    # Chercher les compétences dans le texte
    found_skills = []
    for skill in domain_info['keywords']:
        # Recherche exacte et variations
        skill_patterns = [
            rf'\b{re.escape(skill)}\b',
            rf'\b{re.escape(skill.replace(" ", ""))}\b',  # Sans espaces
            rf'\b{re.escape(skill.replace("-", ""))}\b',  # Sans tirets
        ]
        
        for pattern in skill_patterns:
            if re.search(pattern, text_clean, re.IGNORECASE):
                found_skills.append(skill)
                break
    
    # Supprimer les doublons et limiter le nombre
    unique_skills = list(set(found_skills))
    return unique_skills[:15]  # Limiter à 15 compétences maximum

def train_or_load_model():
    """Entraîne ou charge le modèle de classification"""
    model_path = os.path.join(os.path.dirname(__file__), 'domain_classifier.joblib')
    vectorizer_path = os.path.join(os.path.dirname(__file__), 'tfidf_vectorizer.joblib')
    
    # Vérifier si les modèles existent déjà
    if os.path.exists(model_path) and os.path.exists(vectorizer_path):
        try:
            model = joblib.load(model_path)
            vectorizer = joblib.load(vectorizer_path)
            return model, vectorizer
        except:
            pass  # Si erreur de chargement, réentraîner
    
    # Préparer les données d'entraînement
    texts = []
    labels = []
    
    for domain, examples in TRAINING_DATA.items():
        for example in examples:
            texts.append(clean_text(example))
            labels.append(domain)
    
    # Créer et entraîner le vectoriseur TF-IDF
    vectorizer = TfidfVectorizer(
        max_features=1000,
        ngram_range=(1, 2),
        min_df=1,
        max_df=0.95
    )
    
    X = vectorizer.fit_transform(texts)
    
    # Entraîner le modèle Naive Bayes
    model = MultinomialNB(alpha=0.1)
    model.fit(X, labels)
    
    # Sauvegarder les modèles
    try:
        joblib.dump(model, model_path)
        joblib.dump(vectorizer, vectorizer_path)
    except Exception as e:
        print(f"Attention: Impossible de sauvegarder le modèle: {e}", file=sys.stderr)
    
    return model, vectorizer

def calculate_domain_score(text, domaine, model, vectorizer):
    """Calcule le score de correspondance avec le domaine"""
    if not text:
        return 0.3
    
    try:
        # Transformer le texte avec le vectoriseur
        text_clean = clean_text(text)
        X = vectorizer.transform([text_clean])
        
        # Prédire les probabilités pour chaque domaine
        probabilities = model.predict_proba(X)[0]
        classes = model.classes_
        
        # Trouver la probabilité pour le domaine demandé
        domaine_clean = domaine.lower().strip()
        domain_score = 0.3  # Score par défaut
        
        for i, class_name in enumerate(classes):
            if class_name in domaine_clean or domaine_clean in class_name:
                domain_score = probabilities[i]
                break
        
        return min(max(domain_score, 0.1), 1.0)  # Entre 0.1 et 1.0
        
    except Exception as e:
        print(f"Erreur calcul score domaine: {e}", file=sys.stderr)
        return 0.3

def predict_internship_score(domaine, cv_path):
    """Fonction principale de prédiction du score de stage"""
    try:
        # Charger ou entraîner le modèle
        model, vectorizer = train_or_load_model()
        
        # Extraire le texte du CV
        cv_text = extract_text_from_pdf(cv_path)
        if not cv_text:
            return {
                'score': 0.2,
                'skills': [],
                'experience': 0,
                'domain': domaine,
                'error': 'Impossible de lire le CV'
            }
        
        # Analyser le CV
        experience_years = extract_experience_years(cv_text)
        skills = extract_skills_for_domain(cv_text, domaine)
        domain_score = calculate_domain_score(cv_text, domaine, model, vectorizer)
        
        # Calculer les scores partiels
        exp_score = min(experience_years / 5.0, 1.0)  # Normalisé sur 5 ans
        
        # Score de compétences basé sur le domaine
        domain_info = None
        for domain_key, info in DOMAINES_COMPETENCES.items():
            if domain_key in domaine.lower() or domaine.lower() in domain_key:
                domain_info = info
                break
        
        if domain_info:
            max_skills = len(domain_info['keywords'])
            skill_score = min(len(skills) / max(max_skills * 0.3, 1), 1.0)  # 30% des compétences = score max
        else:
            skill_score = min(len(skills) / 10.0, 1.0)  # Score générique
        
        # Score final pondéré
        final_score = (
            0.4 * domain_score +      # 40% correspondance domaine
            0.35 * skill_score +      # 35% compétences
            0.25 * exp_score          # 25% expérience
        )
        
        # Assurer que le score est dans une plage raisonnable
        final_score = max(0.15, min(final_score, 0.95))
        
        return {
            'score': round(final_score, 3),
            'skills': skills[:10],  # Limiter à 10 compétences
            'experience': experience_years,
            'domain': domaine,
            'domain_score': round(domain_score, 3),
            'skill_score': round(skill_score, 3),
            'exp_score': round(exp_score, 3)
        }
        
    except Exception as e:
        print(f"Erreur dans predict_internship_score: {e}", file=sys.stderr)
        return {
            'score': 0.3,
            'skills': [],
            'experience': 0,
            'domain': domaine,
            'error': str(e)
        }

if __name__ == "__main__":
    try:
        # Vérifier les arguments
        if len(sys.argv) < 2:
            print(json.dumps({
                'score': 0.2,
                'skills': [],
                'experience': 0,
                'error': 'Arguments manquants'
            }))
            sys.exit(1)
        
        # Charger les données d'entrée
        input_data = json.loads(sys.argv[1])
        domaine = input_data.get('domaine', '').strip()
        cv_path = input_data.get('cv_path', '').strip()
        
        if not domaine or not cv_path:
            print(json.dumps({
                'score': 0.2,
                'skills': [],
                'experience': 0,
                'error': 'Domaine ou chemin CV manquant'
            }))
            sys.exit(1)
        
        # Prédire le score
        result = predict_internship_score(domaine, cv_path)
        
        # Retourner le résultat
        print(json.dumps(result, ensure_ascii=False))
        
    except json.JSONDecodeError as e:
        print(json.dumps({
            'score': 0.2,
            'skills': [],
            'experience': 0,
            'error': f'Erreur JSON: {e}'
        }), file=sys.stderr)
        sys.exit(1)
        
    except Exception as e:
        print(json.dumps({
            'score': 0.2,
            'skills': [],
            'experience': 0,
            'error': f'Erreur générale: {e}'
        }), file=sys.stderr)
        sys.exit(1)