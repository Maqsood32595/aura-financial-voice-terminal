import { qsagKb } from '../../core/qsag-kb.js';

/**
 * Search Knowledge Base in RAM
 */
export async function searchKnowledgeBase(params) {
  const query = params.query || '';
  const topK = params.topK || 3;
  const results = qsagKb.search(query, topK);
  return {
    query,
    count: results.length,
    results
  };
}

/**
 * Add custom document to in-memory KB
 */
export async function indexDocument(doc) {
  qsagKb.addDocument(doc);
  return { success: true, docId: doc.id };
}
