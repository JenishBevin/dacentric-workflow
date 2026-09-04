// Local-dev default. In the deployed Docker image this file is overwritten
// at container startup (see Dockerfile) from the real VITE_API_BASE_URL env
// var, so nothing here is meaningful outside `npm run dev`.
window.__RUNTIME_CONFIG__ = {};
