// Font loading script
document.addEventListener('DOMContentLoaded', () => {
  // Find the font stylesheet with media="print" and change it to "all" to load the fonts
  const fontStylesheet = document.querySelector('link[href*="fonts.googleapis.com"][media="print"]');
  if (fontStylesheet) {
    fontStylesheet.media = 'all';
  }
}); 