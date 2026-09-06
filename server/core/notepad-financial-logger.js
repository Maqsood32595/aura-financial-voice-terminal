import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const notepadFilePath = path.resolve(__dirname, '../../financial_notepad.txt');

export class NotepadFinancialLogger {
  constructor() {
    this.ensureHeaderExists();
  }

  ensureHeaderExists() {
    if (!fs.existsSync(notepadFilePath)) {
      const header = `================================================================================
🏛️ SEC EDGAR 10-K · FINANCIAL VOICE ANALYST NOTEPAD
📝 Auto-Generated Audit Trail of Inquired Metrics, Ratios & Comparisons
================================================================================\n\n`;
      fs.writeFileSync(notepadFilePath, header, 'utf8');
    }
  }

  appendToNotepadFile(entryText) {
    fs.appendFile(notepadFilePath, entryText, 'utf8', (err) => {
      if (err) {
        console.error('⚠️ [Financial Notepad Logger] Error writing to file in background:', err.message);
      } else {
        console.log(`📝 [Financial Notepad Logger] Saved metric out-of-band: ${notepadFilePath}`);
      }
    });
  }

  captureFinancialTurn({ session, userTranscript, agentReply, matchedFiling, comparisonResult }) {
    if (!userTranscript || !agentReply) return null;

    const timestamp = new Date().toLocaleString();
    const ticker = matchedFiling ? matchedFiling.ticker : (comparisonResult ? `${comparisonResult.companyA?.ticker} vs ${comparisonResult.companyB?.ticker}` : 'General Macro');
    const company = matchedFiling ? matchedFiling.companyName : (comparisonResult ? 'Cross-Company Comparison' : 'Market Query');

    const entry = `--------------------------------------------------------------------------------
📅 DATE & TIME : ${timestamp}
🏢 COMPANY/TICKER: ${company} (${ticker})
💬 ANALYST ASKED : "${userTranscript.trim()}"
👩‍💼 AGENT SPOKE   : "${agentReply.trim()}"
--------------------------------------------------------------------------------\n\n`;

    this.appendToNotepadFile(entry);

    if (session && session.profile) {
      if (matchedFiling && !session.profile.inquiredCompanies.includes(matchedFiling.ticker)) {
        session.profile.inquiredCompanies.push(matchedFiling.ticker);
      }
    }

    return { timestamp, ticker, company };
  }

  readNotepad() {
    this.ensureHeaderExists();
    return fs.readFileSync(notepadFilePath, 'utf8');
  }

  clearNotepad() {
    const header = `================================================================================
🏛️ SEC EDGAR 10-K · FINANCIAL VOICE ANALYST NOTEPAD
📝 Auto-Generated Audit Trail of Inquired Metrics, Ratios & Comparisons
================================================================================\n\n`;
    fs.writeFileSync(notepadFilePath, header, 'utf8');
    return true;
  }
}

export const notepadFinancialLogger = new NotepadFinancialLogger();
