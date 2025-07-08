// Configuration globale
const CONFIG = {
    API_BASE_URL: 'http://localhost:3000/api',
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_FILE_TYPES: ['application/pdf'],
    TOAST_DURATION: 5000
};

// État global de l'application
const AppState = {
    currentUser: null,
    userType: null,
    token: null,
    isLoading: false,
    currentView: 'auth',
    demandes: [],
    adminDemandes: []
};

// Utilitaires
const Utils = {
    // Afficher/masquer les éléments
    show(element) {
        if (typeof element === 'string') {
            element = document.getElementById(element);
        }
        if (element) {
            element.classList.remove('hidden');
        }
    },

    hide(element) {
        if (typeof element === 'string') {
            element = document.getElementById(element);
        }
        if (element) {
            element.classList.add('hidden');
        }
    },

    // Formater la taille des fichiers
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // Formater les dates
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },

    // Valider les emails
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    // Nettoyer les formulaires
    clearForm(formId) {
        const form = document.getElementById(formId);
        if (form) {
            form.reset();
            // Nettoyer les aperçus de fichiers
            const previews = form.querySelectorAll('.file-preview');
            previews.forEach(preview => {
                preview.classList.add('hidden');
            });
        }
    },

    // Débounce pour les recherches
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// Service API
const ApiService = {
    // Headers par défaut
    getHeaders(includeAuth = false, isFormData = false) {
        const headers = {};
        
        if (!isFormData) {
            headers['Content-Type'] = 'application/json';
        }
        
        if (includeAuth && AppState.token) {
            headers['Authorization'] = `Bearer ${AppState.token}`;
        }
        
        return headers;
    },

    // Gestion des réponses
    async handleResponse(response) {
        try {
            const data = await response.json();
            
            if (response.ok) {
                return { success: true, data };
            } else {
                return { 
                    success: false, 
                    message: data.message || 'Une erreur est survenue' 
                };
            }
        } catch (error) {
            return { 
                success: false, 
                message: 'Erreur de communication avec le serveur' 
            };
        }
    },

    // Inscription candidat
    async registerCandidat(formData) {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/candidat/inscription`, {
                method: 'POST',
                body: formData
            });
            return await this.handleResponse(response);
        } catch (error) {
            return { success: false, message: 'Erreur de connexion au serveur' };
        }
    },

    // Connexion candidat
    async loginCandidat(email, motDePasse) {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/candidat/login`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ email, motDePasse })
            });
            return await this.handleResponse(response);
        } catch (error) {
            return { success: false, message: 'Erreur de connexion au serveur' };
        }
    },

    // Connexion admin
    async loginAdmin(email, motDePasse) {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/admin/login`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ email, motDePasse })
            });
            return await this.handleResponse(response);
        } catch (error) {
            return { success: false, message: 'Erreur de connexion au serveur' };
        }
    },

    // Soumettre une demande
    async submitDemande(formData) {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/demande`, {
                method: 'POST',
                headers: this.getHeaders(true, true),
                body: formData
            });
            return await this.handleResponse(response);
        } catch (error) {
            return { success: false, message: 'Erreur de connexion au serveur' };
        }
    },

    // Récupérer les demandes du candidat
    async getCandidatDemandes() {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/candidat/demandes`, {
                headers: this.getHeaders(true)
            });
            return await this.handleResponse(response);
        } catch (error) {
            return { success: false, message: 'Erreur de connexion au serveur' };
        }
    },

    // Récupérer toutes les demandes (admin)
    async getAdminDemandes(filters = {}) {
        try {
            const params = new URLSearchParams();
            if (filters.statut) params.append('statut', filters.statut);
            if (filters.domaine) params.append('domaine', filters.domaine);
            if (filters.page) params.append('page', filters.page);

            const response = await fetch(`${CONFIG.API_BASE_URL}/admin/demandes?${params}`, {
                headers: this.getHeaders(true)
            });
            return await this.handleResponse(response);
        } catch (error) {
            return { success: false, message: 'Erreur de connexion au serveur' };
        }
    },

    // Mettre à jour une décision (admin)
    async updateDemandeDecision(id, decisionRH, motifRejet = '') {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/admin/demandes/${id}`, {
                method: 'PUT',
                headers: this.getHeaders(true),
                body: JSON.stringify({ decisionRH, motifRejet })
            });
            return await this.handleResponse(response);
        } catch (error) {
            return { success: false, message: 'Erreur de connexion au serveur' };
        }
    }
};

// Gestionnaire de messages toast
const ToastManager = {
    show(message, type = 'success') {
        const toast = document.getElementById('messageToast');
        const toastMessage = document.getElementById('toastMessage');
        const toastIcon = toast.querySelector('.toast-icon i');
        
        // Configurer le message
        toastMessage.textContent = message;
        
        // Configurer l'icône et la couleur
        toast.className = `message-toast ${type}`;
        
        switch (type) {
            case 'success':
                toastIcon.className = 'fas fa-check-circle';
                break;
            case 'error':
                toastIcon.className = 'fas fa-exclamation-circle';
                break;
            case 'warning':
                toastIcon.className = 'fas fa-exclamation-triangle';
                break;
            default:
                toastIcon.className = 'fas fa-info-circle';
        }
        
        // Afficher le toast
        toast.classList.add('show');
        
        // Masquer automatiquement après 5 secondes
        setTimeout(() => {
            this.hide();
        }, CONFIG.TOAST_DURATION);
    },

    hide() {
        const toast = document.getElementById('messageToast');
        toast.classList.remove('show');
    }
};

// Gestionnaire d'authentification
const AuthManager = {
    // Vérifier l'authentification au chargement
    checkAuth() {
        const token = localStorage.getItem('token');
        const userType = localStorage.getItem('userType');
        const userData = localStorage.getItem('userData');

        if (token && userType && userData) {
            try {
                AppState.token = token;
                AppState.userType = userType;
                AppState.currentUser = JSON.parse(userData);
                
                this.showDashboard();
                return true;
            } catch (error) {
                console.error('Erreur lors de la récupération des données utilisateur:', error);
                this.logout();
                return false;
            }
        }
        
        this.showAuth();
        return false;
    },

    // Connexion réussie
    login(userData, token, userType) {
        AppState.currentUser = userData;
        AppState.token = token;
        AppState.userType = userType;

        // Sauvegarder en localStorage
        localStorage.setItem('token', token);
        localStorage.setItem('userType', userType);
        localStorage.setItem('userData', JSON.stringify(userData));

        this.showDashboard();
    },

    // Déconnexion
    logout() {
        AppState.currentUser = null;
        AppState.token = null;
        AppState.userType = null;
        AppState.demandes = [];
        AppState.adminDemandes = [];

        localStorage.removeItem('token');
        localStorage.removeItem('userType');
        localStorage.removeItem('userData');

        this.showAuth();
        ToastManager.show('Déconnexion réussie', 'success');
    },

    // Afficher l'interface d'authentification
    showAuth() {
        Utils.hide('mainHeader');
        Utils.hide('dashboardContainer');
        Utils.show('authContainer');
        AppState.currentView = 'auth';
    },

    // Afficher le tableau de bord
    showDashboard() {
        Utils.hide('authContainer');
        Utils.show('mainHeader');
        Utils.show('dashboardContainer');
        AppState.currentView = 'dashboard';

        this.updateUserInfo();
        
        if (AppState.userType === 'candidat') {
            DashboardManager.showCandidatDashboard();
        } else if (AppState.userType === 'admin') {
            DashboardManager.showAdminDashboard();
        }
    },

    // Mettre à jour les informations utilisateur dans l'en-tête
    updateUserInfo() {
        const userName = document.getElementById('userName');
        const userRole = document.getElementById('userRole');

        if (AppState.currentUser) {
            if (AppState.userType === 'candidat') {
                userName.textContent = `${AppState.currentUser.prenom} ${AppState.currentUser.nom}`;
                userRole.textContent = 'Candidat';
            } else {
                userName.textContent = AppState.currentUser.nom;
                userRole.textContent = 'Administrateur';
            }
        }
    }
};

// Gestionnaire de tableau de bord
const DashboardManager = {
    // Afficher le tableau de bord candidat
    async showCandidatDashboard() {
        Utils.hide('adminDashboard');
        Utils.hide('nouvelleDemandeContainer');
        Utils.show('candidatDashboard');

        // Mettre à jour le nom du candidat
        const candidatName = document.getElementById('candidatName');
        if (candidatName && AppState.currentUser) {
            candidatName.textContent = `${AppState.currentUser.prenom} ${AppState.currentUser.nom}`;
        }

        // Charger les demandes
        await this.loadCandidatDemandes();
    },

    // Afficher le tableau de bord admin
    async showAdminDashboard() {
        Utils.hide('candidatDashboard');
        Utils.hide('nouvelleDemandeContainer');
        Utils.show('adminDashboard');

        // Charger les demandes admin
        await this.loadAdminDemandes();
    },

    // Charger les demandes du candidat
    async loadCandidatDemandes() {
        try {
            const result = await ApiService.getCandidatDemandes();
            
            if (result.success) {
                AppState.demandes = result.data || [];
                this.updateCandidatStats();
                this.renderCandidatDemandes();
            } else {
                ToastManager.show(result.message || 'Erreur lors du chargement des demandes', 'error');
            }
        } catch (error) {
            console.error('Erreur lors du chargement des demandes:', error);
            ToastManager.show('Erreur de connexion au serveur', 'error');
        }
    },

    // Charger les demandes admin
    async loadAdminDemandes(filters = {}) {
        try {
            const result = await ApiService.getAdminDemandes(filters);
            
            if (result.success) {
                AppState.adminDemandes = result.data.demandes || [];
                this.updateAdminStats();
                this.renderAdminDemandes();
            } else {
                ToastManager.show(result.message || 'Erreur lors du chargement des demandes', 'error');
            }
        } catch (error) {
            console.error('Erreur lors du chargement des demandes admin:', error);
            ToastManager.show('Erreur de connexion au serveur', 'error');
        }
    },

    // Mettre à jour les statistiques candidat
    updateCandidatStats() {
        const total = AppState.demandes.length;
        const enAttente = AppState.demandes.filter(d => d.statut === 'En attente').length;
        const acceptees = AppState.demandes.filter(d => d.statut === 'Accepté').length;
        const rejetees = AppState.demandes.filter(d => d.statut === 'Rejeté').length;

        document.getElementById('totalDemandes').textContent = total;
        document.getElementById('demandesEnAttente').textContent = enAttente;
        document.getElementById('demandesAcceptees').textContent = acceptees;
        document.getElementById('demandesRejetees').textContent = rejetees;
    },

    // Mettre à jour les statistiques admin
    updateAdminStats() {
        const total = AppState.adminDemandes.length;
        const enAttente = AppState.adminDemandes.filter(d => d.statut === 'En attente').length;
        const acceptees = AppState.adminDemandes.filter(d => d.statut === 'Accepté').length;
        const rejetees = AppState.adminDemandes.filter(d => d.statut === 'Rejeté').length;

        document.getElementById('adminTotalDemandes').textContent = total;
        document.getElementById('adminDemandesEnAttente').textContent = enAttente;
        document.getElementById('adminDemandesAcceptees').textContent = acceptees;
        document.getElementById('adminDemandesRejetees').textContent = rejetees;
    },

    // Afficher les demandes candidat
    renderCandidatDemandes() {
        const container = document.getElementById('demandesList');
        
        if (AppState.demandes.length === 0) {
            container.innerHTML = `
                <div class="text-center" style="padding: 3rem;">
                    <i class="fas fa-file-alt" style="font-size: 3rem; color: var(--gray-300); margin-bottom: 1rem;"></i>
                    <h3 style="color: var(--gray-500); margin-bottom: 0.5rem;">Aucune demande trouvée</h3>
                    <p style="color: var(--gray-400);">Commencez par soumettre votre première demande de stage</p>
                </div>
            `;
            return;
        }

        container.innerHTML = AppState.demandes.map(demande => `
            <div class="demande-card">
                <div class="demande-header">
                    <h3 class="demande-title">
                        <i class="fas fa-briefcase"></i>
                        ${demande.domaine} - ${demande.etablissement}
                    </h3>
                    <span class="status-badge ${this.getStatusClass(demande.statut)}">
                        ${demande.statut}
                    </span>
                </div>
                
                <div class="demande-details">
                    <div class="detail-item">
                        <span class="detail-label">Niveau</span>
                        <span class="detail-value">${demande.niveau}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Date de dépôt</span>
                        <span class="detail-value">${Utils.formatDate(demande.dateDepot)}</span>
                    </div>
                    ${demande.scoreML ? `
                        <div class="detail-item">
                            <span class="detail-label">Score ML</span>
                            <span class="detail-value">${Math.round(demande.scoreML * 100)}%</span>
                        </div>
                    ` : ''}
                    ${demande.experienceML ? `
                        <div class="detail-item">
                            <span class="detail-label">Expérience détectée</span>
                            <span class="detail-value">${demande.experienceML} an(s)</span>
                        </div>
                    ` : ''}
                </div>

                ${demande.competencesML && demande.competencesML.length > 0 ? `
                    <div class="skills-container">
                        <span class="detail-label">Compétences détectées:</span>
                        <div class="skills-list">
                            ${demande.competencesML.map(skill => `
                                <span class="skill-tag">${skill}</span>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${demande.decisionRH && demande.decisionRH !== 'En attente' ? `
                    <div class="detail-item">
                        <span class="detail-label">Décision RH:</span>
                        <span class="detail-value text-${demande.decisionRH === 'Accepté' ? 'success' : 'danger'}">
                            ${demande.decisionRH}
                        </span>
                    </div>
                ` : ''}

                ${demande.motifRejet ? `
                    <div style="margin: 1rem 0; padding: 1rem; background: rgba(239, 68, 68, 0.1); border-radius: 0.5rem; border-left: 4px solid var(--danger-color);">
                        <span class="detail-label" style="color: var(--danger-color);">Motif de rejet:</span>
                        <p style="margin-top: 0.5rem; color: var(--danger-color);">${demande.motifRejet}</p>
                    </div>
                ` : ''}

                ${demande.description ? `
                    <div class="detail-item">
                        <span class="detail-label">Description:</span>
                        <p style="margin-top: 0.5rem; color: var(--gray-600);">${demande.description}</p>
                    </div>
                ` : ''}

                <div class="demande-actions">
                    <a href="${CONFIG.API_BASE_URL.replace('/api', '')}${demande.cvUrl}" target="_blank" class="action-btn">
                        <i class="fas fa-download"></i>
                        Télécharger CV
                    </a>
                    <a href="${CONFIG.API_BASE_URL.replace('/api', '')}${demande.lettreUrl}" target="_blank" class="action-btn">
                        <i class="fas fa-download"></i>
                        Télécharger Lettre
                    </a>
                </div>
            </div>
        `).join('');
    },

    // Afficher les demandes admin
    renderAdminDemandes() {
        const container = document.getElementById('adminDemandesContainer');
        
        if (AppState.adminDemandes.length === 0) {
            container.innerHTML = `
                <div class="text-center" style="padding: 3rem;">
                    <i class="fas fa-users" style="font-size: 3rem; color: var(--gray-300); margin-bottom: 1rem;"></i>
                    <h3 style="color: var(--gray-500); margin-bottom: 0.5rem;">Aucune demande à gérer</h3>
                    <p style="color: var(--gray-400);">Les nouvelles demandes apparaîtront ici</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Candidat</th>
                        <th>Domaine</th>
                        <th>Statut</th>
                        <th>Score ML</th>
                        <th>Date</th>
                        <th>Décision</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${AppState.adminDemandes.map(demande => `
                        <tr>
                            <td>
                                <div>
                                    <div style="font-weight: 600;">${demande.prenom} ${demande.nom}</div>
                                    <div style="font-size: 0.875rem; color: var(--gray-600);">${demande.email}</div>
                                    ${demande.telephone ? `<div style="font-size: 0.875rem; color: var(--gray-600);">${demande.telephone}</div>` : ''}
                                </div>
                            </td>
                            <td>
                                <div>${demande.domaine}</div>
                                <div style="font-size: 0.875rem; color: var(--gray-600);">${demande.niveau}</div>
                            </td>
                            <td>
                                <span class="status-badge ${this.getStatusClass(demande.statut)}">
                                    ${demande.statut}
                                </span>
                            </td>
                            <td>
                                ${demande.scoreML ? `${Math.round(demande.scoreML * 100)}%` : '-'}
                            </td>
                            <td>${Utils.formatDate(demande.dateDepot)}</td>
                            <td>
                                <select class="decision-select" data-id="${demande.idDemande}">
                                    <option value="En attente" ${demande.decisionRH === 'En attente' ? 'selected' : ''}>En attente</option>
                                    <option value="Accepté" ${demande.decisionRH === 'Accepté' ? 'selected' : ''}>Accepté</option>
                                    <option value="Rejeté" ${demande.decisionRH === 'Rejeté' ? 'selected' : ''}>Rejeté</option>
                                </select>
                                ${demande.decisionRH === 'Rejeté' || demande.motifRejet ? `
                                    <input type="text" placeholder="Motif de rejet" class="motif-input" data-id="${demande.idDemande}" 
                                           value="${demande.motifRejet || ''}" style="margin-top: 0.5rem; padding: 0.5rem; border: 1px solid var(--gray-300); border-radius: 0.25rem; width: 100%;">
                                ` : ''}
                            </td>
                            <td>
                                <div class="table-actions">
                                    <button class="save-btn" data-id="${demande.idDemande}">
                                        <i class="fas fa-save"></i>
                                        Enregistrer
                                    </button>
                                    <a href="${CONFIG.API_BASE_URL.replace('/api', '')}${demande.cvUrl}" target="_blank" class="action-btn">
                                        <i class="fas fa-download"></i>
                                        CV
                                    </a>
                                    <a href="${CONFIG.API_BASE_URL.replace('/api', '')}${demande.lettreUrl}" target="_blank" class="action-btn">
                                        <i class="fas fa-download"></i>
                                        Lettre
                                    </a>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        // Ajouter les gestionnaires d'événements pour les décisions
        this.attachAdminEventListeners();
    },

    // Attacher les gestionnaires d'événements admin
    attachAdminEventListeners() {
        // Gestionnaire pour les boutons de sauvegarde
        document.querySelectorAll('.save-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                const decisionSelect = document.querySelector(`.decision-select[data-id="${id}"]`);
                const motifInput = document.querySelector(`.motif-input[data-id="${id}"]`);
                
                const decision = decisionSelect.value;
                const motif = motifInput ? motifInput.value : '';

                if (!decision) {
                    ToastManager.show('Veuillez sélectionner une décision', 'warning');
                    return;
                }

                try {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';

                    const result = await ApiService.updateDemandeDecision(id, decision, motif);
                    
                    if (result.success) {
                        ToastManager.show('Décision enregistrée avec succès', 'success');
                        await this.loadAdminDemandes();
                    } else {
                        ToastManager.show(result.message || 'Erreur lors de l\'enregistrement', 'error');
                    }
                } catch (error) {
                    console.error('Erreur lors de l\'enregistrement:', error);
                    ToastManager.show('Erreur de connexion au serveur', 'error');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
                }
            });
        });

        // Gestionnaire pour les changements de décision (afficher/masquer le motif)
        document.querySelectorAll('.decision-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                const row = e.target.closest('tr');
                const motifInput = row.querySelector(`.motif-input[data-id="${id}"]`);
                
                if (e.target.value === 'Rejeté') {
                    if (!motifInput) {
                        const newMotifInput = document.createElement('input');
                        newMotifInput.type = 'text';
                        newMotifInput.placeholder = 'Motif de rejet';
                        newMotifInput.className = 'motif-input';
                        newMotifInput.dataset.id = id;
                        newMotifInput.style.cssText = 'margin-top: 0.5rem; padding: 0.5rem; border: 1px solid var(--gray-300); border-radius: 0.25rem; width: 100%;';
                        e.target.parentNode.appendChild(newMotifInput);
                    }
                } else {
                    if (motifInput) {
                        motifInput.remove();
                    }
                }
            });
        });
    },

    // Obtenir la classe CSS pour le statut
    getStatusClass(statut) {
        switch (statut.toLowerCase()) {
            case 'accepté':
                return 'success';
            case 'rejeté':
                return 'danger';
            default:
                return 'pending';
        }
    }
};

// Gestionnaire de formulaires
const FormManager = {
    // Initialiser les gestionnaires de formulaires
    init() {
        this.initAuthForms();
        this.initDemandeForm();
        this.initFileUploads();
    },

    // Initialiser les formulaires d'authentification
    initAuthForms() {
        // Formulaire d'inscription
        const formInscription = document.getElementById('formInscription');
        if (formInscription) {
            formInscription.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleInscription(e.target);
            });
        }

        // Formulaire de connexion candidat
        const formConnexion = document.getElementById('formConnexion');
        if (formConnexion) {
            formConnexion.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleConnexionCandidat(e.target);
            });
        }

        // Formulaire de connexion admin
        const formAdmin = document.getElementById('formAdmin');
        if (formAdmin) {
            formAdmin.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleConnexionAdmin(e.target);
            });
        }
    },

    // Initialiser le formulaire de demande
    initDemandeForm() {
        const formNouvelleDemande = document.getElementById('formNouvelleDemande');
        if (formNouvelleDemande) {
            formNouvelleDemande.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleNouvelleDemande(e.target);
            });
        }
    },

    // Initialiser les uploads de fichiers
    initFileUploads() {
        this.initFileUpload('cvFile', 'cvPreview', 'cvUploadArea');
        this.initFileUpload('lettreFile', 'lettrePreview', 'lettreUploadArea');
    },

    // Initialiser un upload de fichier spécifique
    initFileUpload(inputId, previewId, areaId) {
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        const area = document.getElementById(areaId);

        if (!input || !preview || !area) return;

        // Gestionnaire de changement de fichier
        input.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files[0], preview, area);
        });

        // Gestionnaires de drag & drop
        area.addEventListener('dragover', (e) => {
            e.preventDefault();
            area.classList.add('dragover');
        });

        area.addEventListener('dragleave', (e) => {
            e.preventDefault();
            area.classList.remove('dragover');
        });

        area.addEventListener('drop', (e) => {
            e.preventDefault();
            area.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                input.files = files;
                this.handleFileSelect(files[0], preview, area);
            }
        });
    },

    // Gérer la sélection de fichier
    handleFileSelect(file, preview, area) {
        if (!file) {
            preview.classList.add('hidden');
            return;
        }

        // Vérifier le type de fichier
        if (!CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
            ToastManager.show('Seuls les fichiers PDF sont acceptés', 'error');
            return;
        }

        // Vérifier la taille
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            ToastManager.show('Le fichier est trop volumineux (max 5MB)', 'error');
            return;
        }

        // Afficher l'aperçu
        preview.innerHTML = `
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${Utils.formatFileSize(file.size)}</div>
            </div>
            <button type="button" class="remove-file" onclick="this.closest('.file-upload-area').querySelector('input').value=''; this.closest('.file-preview').classList.add('hidden');">
                <i class="fas fa-times"></i>
            </button>
        `;
        preview.classList.remove('hidden');
    },

    // Gérer l'inscription
    async handleInscription(form) {
        const submitBtn = form.querySelector('.submit-btn');
        const btnText = submitBtn.querySelector('span');
        const btnLoader = submitBtn.querySelector('.btn-loader');

        try {
            // Afficher le loader
            btnText.style.opacity = '0';
            btnLoader.classList.remove('hidden');
            submitBtn.disabled = true;

            // Préparer les données
            const formData = new FormData(form);

            // Valider les données
            if (!this.validateInscriptionForm(formData)) {
                return;
            }

            // Envoyer la requête
            const result = await ApiService.registerCandidat(formData);

            if (result.success) {
                ToastManager.show('Inscription réussie! Vous pouvez maintenant vous connecter.', 'success');
                Utils.clearForm('formInscription');
                TabManager.setActiveTab('connexion');
            } else {
                ToastManager.show(result.message || 'Erreur lors de l\'inscription', 'error');
            }
        } catch (error) {
            console.error('Erreur lors de l\'inscription:', error);
            ToastManager.show('Erreur de connexion au serveur', 'error');
        } finally {
            // Masquer le loader
            btnText.style.opacity = '1';
            btnLoader.classList.add('hidden');
            submitBtn.disabled = false;
        }
    },

    // Gérer la connexion candidat
    async handleConnexionCandidat(form) {
        const submitBtn = form.querySelector('.submit-btn');
        const btnText = submitBtn.querySelector('span');
        const btnLoader = submitBtn.querySelector('.btn-loader');

        try {
            // Afficher le loader
            btnText.style.opacity = '0';
            btnLoader.classList.remove('hidden');
            submitBtn.disabled = true;

            const formData = new FormData(form);
            const email = formData.get('email');
            const motDePasse = formData.get('motDePasse');

            // Valider les données
            if (!email || !motDePasse) {
                ToastManager.show('Veuillez remplir tous les champs', 'warning');
                return;
            }

            if (!Utils.isValidEmail(email)) {
                ToastManager.show('Adresse email invalide', 'warning');
                return;
            }

            // Envoyer la requête
            const result = await ApiService.loginCandidat(email, motDePasse);

            if (result.success) {
                AuthManager.login(result.data.user, result.data.token, 'candidat');
                ToastManager.show('Connexion réussie!', 'success');
                Utils.clearForm('formConnexion');
            } else {
                ToastManager.show(result.message || 'Identifiants incorrects', 'error');
            }
        } catch (error) {
            console.error('Erreur lors de la connexion:', error);
            ToastManager.show('Erreur de connexion au serveur', 'error');
        } finally {
            // Masquer le loader
            btnText.style.opacity = '1';
            btnLoader.classList.add('hidden');
            submitBtn.disabled = false;
        }
    },

    // Gérer la connexion admin
    async handleConnexionAdmin(form) {
        const submitBtn = form.querySelector('.submit-btn');
        const btnText = submitBtn.querySelector('span');
        const btnLoader = submitBtn.querySelector('.btn-loader');

        try {
            // Afficher le loader
            btnText.style.opacity = '0';
            btnLoader.classList.remove('hidden');
            submitBtn.disabled = true;

            const formData = new FormData(form);
            const email = formData.get('email');
            const motDePasse = formData.get('motDePasse');

            // Valider les données
            if (!email || !motDePasse) {
                ToastManager.show('Veuillez remplir tous les champs', 'warning');
                return;
            }

            if (!Utils.isValidEmail(email)) {
                ToastManager.show('Adresse email invalide', 'warning');
                return;
            }

            // Envoyer la requête
            const result = await ApiService.loginAdmin(email, motDePasse);

            if (result.success) {
                AuthManager.login(result.data.admin, result.data.token, 'admin');
                ToastManager.show('Connexion administrateur réussie!', 'success');
                Utils.clearForm('formAdmin');
            } else {
                ToastManager.show(result.message || 'Identifiants administrateur incorrects', 'error');
            }
        } catch (error) {
            console.error('Erreur lors de la connexion admin:', error);
            ToastManager.show('Erreur de connexion au serveur', 'error');
        } finally {
            // Masquer le loader
            btnText.style.opacity = '1';
            btnLoader.classList.add('hidden');
            submitBtn.disabled = false;
        }
    },

    // Gérer la nouvelle demande
    async handleNouvelleDemande(form) {
        const submitBtn = form.querySelector('.submit-btn');
        const btnText = submitBtn.querySelector('span');
        const btnLoader = submitBtn.querySelector('.btn-loader');

        try {
            // Afficher le loader
            btnText.style.opacity = '0';
            btnLoader.classList.remove('hidden');
            submitBtn.disabled = true;

            // Préparer les données
            const formData = new FormData(form);

            // Valider les données
            if (!this.validateDemandeForm(formData)) {
                return;
            }

            // Envoyer la requête
            const result = await ApiService.submitDemande(formData);

            if (result.success) {
                ToastManager.show('Demande soumise avec succès! Analyse en cours...', 'success');
                Utils.clearForm('formNouvelleDemande');
                
                // Retourner au tableau de bord
                setTimeout(() => {
                    DashboardManager.showCandidatDashboard();
                }, 1000);
            } else {
                ToastManager.show(result.message || 'Erreur lors de la soumission', 'error');
            }
        } catch (error) {
            console.error('Erreur lors de la soumission:', error);
            ToastManager.show('Erreur de connexion au serveur', 'error');
        } finally {
            // Masquer le loader
            btnText.style.opacity = '1';
            btnLoader.classList.add('hidden');
            submitBtn.disabled = false;
        }
    },

    // Valider le formulaire d'inscription
    validateInscriptionForm(formData) {
        const nom = formData.get('nom');
        const prenom = formData.get('prenom');
        const email = formData.get('email');
        const motDePasse = formData.get('motDePasse');
        const etablissement = formData.get('etablissement');
        const domaine = formData.get('domaine');
        const niveau = formData.get('niveau');

        if (!nom || !prenom || !email || !motDePasse || !etablissement || !domaine || !niveau) {
            ToastManager.show('Veuillez remplir tous les champs obligatoires', 'warning');
            return false;
        }

        if (!Utils.isValidEmail(email)) {
            ToastManager.show('Adresse email invalide', 'warning');
            return false;
        }

        if (motDePasse.length < 6) {
            ToastManager.show('Le mot de passe doit contenir au moins 6 caractères', 'warning');
            return false;
        }

        return true;
    },

    // Valider le formulaire de demande
    validateDemandeForm(formData) {
        const domaine = formData.get('domaine');
        const etablissement = formData.get('etablissement');
        const niveau = formData.get('niveau');
        const cv = formData.get('cv');
        const lettre = formData.get('lettre');

        if (!domaine || !etablissement || !niveau) {
            ToastManager.show('Veuillez remplir tous les champs obligatoires', 'warning');
            return false;
        }

        if (!cv || cv.size === 0) {
            ToastManager.show('Veuillez sélectionner un fichier CV', 'warning');
            return false;
        }

        if (!lettre || lettre.size === 0) {
            ToastManager.show('Veuillez sélectionner une lettre de motivation', 'warning');
            return false;
        }

        return true;
    }
};

// Gestionnaire d'onglets
const TabManager = {
    init() {
        // Gestionnaires pour les onglets d'authentification
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                this.setActiveTab(tabId);
            });
        });
    },

    setActiveTab(tabId) {
        // Désactiver tous les onglets et formulaires
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.remove('active');
        });

        // Activer l'onglet et le formulaire sélectionnés
        const activeBtn = document.querySelector(`[data-tab="${tabId}"]`);
        const activeForm = document.getElementById(`form${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);

        if (activeBtn) activeBtn.classList.add('active');
        if (activeForm) activeForm.classList.add('active');
    }
};

// Gestionnaire de filtres (admin)
const FilterManager = {
    init() {
        const btnApplyFilters = document.getElementById('btnApplyFilters');
        if (btnApplyFilters) {
            btnApplyFilters.addEventListener('click', () => {
                this.applyFilters();
            });
        }

        // Recherche en temps réel avec debounce
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce(() => {
                this.applyFilters();
            }, 500));
        }
    },

    async applyFilters() {
        const statut = document.getElementById('filterStatut').value;
        const domaine = document.getElementById('filterDomaine').value;
        const search = document.getElementById('searchInput').value;

        const filters = {};
        if (statut) filters.statut = statut;
        if (domaine) filters.domaine = domaine;
        if (search) filters.search = search;

        await DashboardManager.loadAdminDemandes(filters);
    }
};

// Initialisation de l'application
class App {
    constructor() {
        this.init();
    }

    async init() {
        // Afficher l'écran de chargement
        this.showLoadingScreen();

        // Attendre un peu pour l'effet visuel
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Initialiser les gestionnaires
        this.initEventListeners();
        FormManager.init();
        TabManager.init();
        FilterManager.init();

        // Vérifier l'authentification
        AuthManager.checkAuth();

        // Masquer l'écran de chargement
        this.hideLoadingScreen();
    }

    showLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        const mainContainer = document.getElementById('mainContainer');
        
        if (loadingScreen) loadingScreen.classList.remove('hidden');
        if (mainContainer) mainContainer.classList.add('hidden');
    }

    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        const mainContainer = document.getElementById('mainContainer');
        
        setTimeout(() => {
            if (loadingScreen) loadingScreen.classList.add('hidden');
            if (mainContainer) mainContainer.classList.remove('hidden');
        }, 500);
    }

    initEventListeners() {
        // Bouton de déconnexion
        const btnLogout = document.getElementById('btnLogout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => {
                AuthManager.logout();
            });
        }

        // Bouton nouvelle demande
        const btnNouvelleDemande = document.getElementById('btnNouvelledemande');
        if (btnNouvelleDemande) {
            btnNouvelleDemande.addEventListener('click', () => {
                this.showNouvelleDemandeForm();
            });
        }

        // Bouton retour dashboard
        const btnRetourDashboard = document.getElementById('btnRetourDashboard');
        if (btnRetourDashboard) {
            btnRetourDashboard.addEventListener('click', () => {
                DashboardManager.showCandidatDashboard();
            });
        }

        // Boutons de rafraîchissement
        const btnRefreshDemandes = document.getElementById('btnRefreshDemandes');
        if (btnRefreshDemandes) {
            btnRefreshDemandes.addEventListener('click', () => {
                DashboardManager.loadCandidatDemandes();
            });
        }

        const btnRefreshAdmin = document.getElementById('btnRefreshAdmin');
        if (btnRefreshAdmin) {
            btnRefreshAdmin.addEventListener('click', () => {
                DashboardManager.loadAdminDemandes();
            });
        }

        // Fermeture du toast
        const closeToast = document.getElementById('closeToast');
        if (closeToast) {
            closeToast.addEventListener('click', () => {
                ToastManager.hide();
            });
        }

        // Navigation principale
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                // Gérer la navigation si nécessaire
            });
        });
    }

    showNouvelleDemandeForm() {
        Utils.hide('candidatDashboard');
        Utils.hide('adminDashboard');
        Utils.show('nouvelleDemandeContainer');
    }
}

// Démarrer l'application quand le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    new App();
});

// Gestion des erreurs globales
window.addEventListener('error', (e) => {
    console.error('Erreur globale:', e.error);
    ToastManager.show('Une erreur inattendue s\'est produite', 'error');
});

// Gestion des promesses rejetées
window.addEventListener('unhandledrejection', (e) => {
    console.error('Promesse rejetée:', e.reason);
    ToastManager.show('Erreur de traitement des données', 'error');
});