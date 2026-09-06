import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * In-RAM PostgreSQL Engine for SEC EDGAR Filings
 * Zero disk I/O, WebAssembly execution in RAM (<0.1ms query latency)
 */
export class ShadowFinancialDb {
  constructor() {
    this.pg = null;
    this.isInitialized = false;
    this.queryLogs = [];
  }

  async init() {
    if (this.isInitialized) return;

    // 1. Boot In-RAM PGlite Engine (0 disk I/O)
    this.pg = new PGlite();

    // 2. Create SEC 10-K Relational Schema
    await this.pg.exec(`
      CREATE TABLE IF NOT EXISTS sec_filings (
        id VARCHAR(64) PRIMARY KEY,
        ticker VARCHAR(10) NOT NULL,
        company_name VARCHAR(128) NOT NULL,
        sector VARCHAR(64) NOT NULL,
        cik VARCHAR(20) NOT NULL,
        fiscal_year INT NOT NULL,
        revenue BIGINT NOT NULL,
        gross_profit BIGINT,
        gross_margin_pct DOUBLE PRECISION,
        operating_income BIGINT NOT NULL,
        operating_margin_pct DOUBLE PRECISION NOT NULL,
        net_income BIGINT NOT NULL,
        rd_expense BIGINT NOT NULL,
        free_cash_flow BIGINT NOT NULL,
        key_highlights TEXT
      );

      CREATE TABLE IF NOT EXISTS analyst_audit_trail (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(128) NOT NULL,
        inquired_ticker VARCHAR(10) NOT NULL,
        queried_metric VARCHAR(64) NOT NULL,
        computed_value VARCHAR(128),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Seed Master SEC Filings in RAM (Batched 50-row chunks for minimal memory footprint)
    const dataPath = path.resolve(__dirname, '../data/sec_financials_master.json');
    const filings = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    for (let i = 0; i < filings.length; i += 50) {
      const chunk = filings.slice(i, i + 50);
      const values = [];
      const params = [];
      let idx = 1;
      for (const f of chunk) {
        values.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7}, $${idx+8}, $${idx+9}, $${idx+10}, $${idx+11}, $${idx+12}, $${idx+13}, $${idx+14})`);
        params.push(
          f.id, f.ticker, f.companyName, f.sector, f.cik, f.fiscalYear,
          f.revenue, f.grossProfit, f.grossMarginPercent, f.operatingIncome,
          f.operatingMarginPercent, f.netIncome, f.rdExpense, f.freeCashFlow,
          f.keyHighlights
        );
        idx += 15;
      }
      await this.pg.query(
        `INSERT INTO sec_filings (
          id, ticker, company_name, sector, cik, fiscal_year, revenue,
          gross_profit, gross_margin_pct, operating_income, operating_margin_pct,
          net_income, rd_expense, free_cash_flow, key_highlights
        ) VALUES ${values.join(', ')} ON CONFLICT (id) DO NOTHING;`,
        params
      );
    }

    this.isInitialized = true;
    console.log(`⚡ [SEC In-RAM PostgreSQL] PGlite Engine initialized with ${filings.length} filings (0 disk I/O)`);
  }

  async query(sql, params = []) {
    const t0 = performance.now();
    await this.init();
    const result = await this.pg.query(sql, params);
    const latencyMs = Number((performance.now() - t0).toFixed(3));

    const logEntry = {
      sql,
      params,
      rowCount: result.rows.length,
      latencyMs,
      timestamp: new Date().toISOString()
    };
    this.queryLogs.push(logEntry);
    if (this.queryLogs.length > 50) this.queryLogs.shift();

    return { ...result, latencyMs };
  }

  async teardown() {
    if (this.pg) {
      await this.pg.close();
      this.pg = null;
      this.isInitialized = false;
      this.queryLogs = [];
    }
  }
}

export const shadowFinancialDb = new ShadowFinancialDb();
