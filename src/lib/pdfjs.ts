/* One shared pdf.js loader for the viewer and the background indexer. */
let p: Promise<any> | null = null;
export function loadPdfjs(): Promise<any> {
  if (!p) {
    p = import('pdfjs-dist').then((m: any) => {
      m.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();
      return m;
    });
  }
  return p;
}
