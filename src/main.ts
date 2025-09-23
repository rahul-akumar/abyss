// Register the custom element; no app mount required for now.
import './elements/abyss-veil';

// Load Vercel Analytics only in production to avoid 404s during local dev
if (import.meta.env.PROD) {
  (window as any).va = (window as any).va || function () { ((window as any).vaq = (window as any).vaq || []).push(arguments); };
  const s = document.createElement('script');
  s.defer = true;
  s.src = '/_vercel/insights/script.js';
  document.head.appendChild(s);
}
