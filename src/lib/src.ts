/** Source link kept in the question: <!--src:PDFID:PAGE--> (set when a card is made from a highlighted PDF passage). */
export const parseSrc = (q: string): { pdfId: string; page: number } | null => { const m = /<!--src:([^:>]+):(\d+)-->/.exec(String(q || '')); return m ? { pdfId: m[1], page: +m[2] } : null; };
