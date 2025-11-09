// This is your serverless function
// It will live at https://your-app-name.vercel.app/api

import { google } from 'googleapis';

export default async function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).send({ message: 'Only POST requests allowed' });
  }

  // 2. Get the toolName and parameters from Vapi
  // In Vapi 2.0, parameters are nested. In 1.0, they are at the root.
  // This code handles both for safety.
  const body = req.body;
  const toolName = body.toolName || body.toolCall?.toolName;
  const parameters = body.parameters || body.toolCall?.parameters || {};
  const dobToFind = parameters.dob;

  // 3. Handle the 'findPatientInSheet' tool
  if (toolName === 'findPatientInSheet') {
    try {
      // 4. Authenticate with Google
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Vercel needs this replace()
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      
      // 5. Read from your Google Sheet
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: 'Patients!A:E', // Get columns A through E from the 'Patients' tab
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        throw new Error('No data found in sheet.');
      }

      // 6. Find the patient (skipping the header row [0])
      // Note: This assumes DOB is in the first column (A)
      let foundPatient = null;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[0] === dobToFind) {
          foundPatient = {
            dob: row[0],
            fullName: row[1],
            pcp: row[2],
            insurance: row[3],
            referring: row[4],
          };
          break;
        }
      }

      // 7. Send the correct response back to Vapi
      if (foundPatient) {
        // SUCCESS: Patient was found
        return res.status(200).json({
          patient_status: 'found',
          patient_data: foundPatient,
        });
      } else {
        // SUCCESS: Search finished, but no patient was found
        return res.status(200).json({
          patient_status: 'not_found',
          patient_data: null,
        });
      }

    } catch (error) {
      console.error('Error finding patient:', error);
      // FAILURE: The API call itself failed
      return res.status(500).json({ error: error.message });
    }
  }

  // Handle other tools if you add them to this one API file
  return res.status(400).json({ message: 'Unknown tool' });
}