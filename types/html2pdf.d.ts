/**
 * types/html2pdf.d.ts
 *
 * html2pdf.js ships no type declarations, and — unlike most untyped
 * packages — there is no @types/html2pdf.js package on npm to install
 * either. Without this file, TypeScript fails to compile the dynamic
 * `import("html2pdf.js")` in components/LessonPresentation.tsx with:
 * "Could not find a declaration file for module 'html2pdf.js'".
 */
declare module "html2pdf.js" {
  interface Html2PdfImageOptions {
    type?: "jpeg" | "png" | "webp";
    quality?: number;
  }

  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: Html2PdfImageOptions;
    html2canvas?: Record<string, unknown>;
    jsPDF?: Record<string, unknown>;
  }

  interface Html2PdfWorker {
    set: (options: Html2PdfOptions) => Html2PdfWorker;
    from: (element: HTMLElement) => Html2PdfWorker;
    save: () => Promise<void>;
    outputPdf: (type?: string) => Promise<unknown>;
  }

  function html2pdf(): Html2PdfWorker;
  export default html2pdf;
}
