const db = require('../db');
const crypto = require('crypto');

/**
 * Credential Manager Module
 * Securely stores and retrieves API credentials for autonomous bots.
 */
class CredentialManager {
    constructor() {
        // In a production app, we would use a system environment variable for encryption
        this.secret = process.env.VAULT_SECRET || 'workwalaa-secure-agent-vault-2026';
    }

    /**
     * Store a credential entry
     */
    async storeCredential(provider, key, value) {
        const encrypted = this.encrypt(value);
        return new Promise((resolve, reject) => {
            db.run(`INSERT OR REPLACE INTO app_settings (user_id, theme, ${provider}_key) VALUES (1, 'dark', ?)`, 
                [encrypted], (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    }

    /**
     * Retrieve a credential entry
     */
    async getCredential(provider) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT ${provider}_key FROM app_settings WHERE user_id = 1`, (err, row) => {
                if (err || !row) resolve('');
                else resolve(this.decrypt(row[`${provider}_key`]));
            });
        });
    }

    /**
     * Fetch all relevant credentials for a specific bot task
     */
    async findSettings() {
        return new Promise((resolve) => {
            db.get(`SELECT * FROM app_settings WHERE user_id = 1`, (err, row) => resolve(row || {}));
        });
    }

    async getBotCredentials(botRole) {
        const settings = await this.findSettings();

        // Map credentials based on bot role requirements
        const creds = {};
        if (botRole.includes('Bot 1') || botRole.includes('Bot 1')) {
            creds.google_sheets_creds = this.decrypt(settings.google_sheets_creds);
            creds.spreadsheet_id = settings.google_sheets_id;
        }
        if (botRole.includes('Bot 2')) {
            creds.google_sheets_creds = this.decrypt(settings.google_sheets_creds);
            creds.spreadsheet_id = settings.google_sheets_id;
        }
        if (botRole.includes('Bot 3') || botRole.includes('External')) {
            creds.naukri = this.decrypt(settings.groq_key);
            creds.openrouter = this.decrypt(settings.openrouter_key);
        }
        
        return creds;
    }

    // Helper: Encrypt value
    encrypt(text) {
        if (!text) return '';
        try {
            const cipher = crypto.createCipher('aes-256-cbc', this.secret);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            return encrypted;
        } catch(e) { return text; }
    }

    // Helper: Decrypt value
    decrypt(text) {
        if (!text || text.length < 16) return text; 
        try {
            const decipher = crypto.createDecipher('aes-256-cbc', this.secret);
            let decrypted = decipher.update(text, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (e) {
            return text; // Fallback to raw if not encrypted
        }
    }
}

module.exports = new CredentialManager();
