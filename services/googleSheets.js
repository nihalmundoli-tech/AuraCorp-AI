// services/googleSheets.js
const { google } = require('googleapis');

/**
 * Appends a row of data to a Google Sheet
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} range - The range to append (e.g. 'Sheet1!A1')
 * @param {Array} values - Array of values to append
 * @param {Object} credentials - Service account credentials (JSON)
 */
async function appendToSheet(spreadsheetId, range, values, credentials) {
    if (!spreadsheetId || !credentials) {
        console.warn('Google Sheets credentials or Spreadsheet ID missing. Skipping sheet update.');
        return null;
    }

    try {
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [values],
            },
        });

        return response.data;
    } catch (error) {
        console.error('Google Sheets Error:', error);
        throw error;
    }
}

module.exports = {
    appendToSheet
};
