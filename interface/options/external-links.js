// External links handler
document.addEventListener('DOMContentLoaded', () => {
  // Find all external links with the class 'external-link'
  const externalLinks = document.querySelectorAll('.external-link');
  
  // Add click event listeners to each link
  externalLinks.forEach(link => {
    link.addEventListener('click', function(event) {
      event.preventDefault();
      
      // Get the actual URL from the data-href attribute
      const url = this.getAttribute('data-href');
      if (url) {
        // Use the browser API to open URL in a new tab
        chrome.tabs.create({ url: url });
      }
    });
  });
}); 