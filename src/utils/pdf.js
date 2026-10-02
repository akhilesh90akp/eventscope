/**
 * PDF utility - uses window.print() for PDF generation
 * The document container should have class "print-doc" for proper print styling
 */
export const generatePDF = (element, filename) => {
  // Simply trigger browser print - user can "Save as PDF"
  window.print();
};
