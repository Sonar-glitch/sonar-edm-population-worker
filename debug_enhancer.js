const RecommendationEnhancer = require('./lib/recommendationEnhancer');
const enhancer = new RecommendationEnhancer();
console.log('Enhancer enabled:', enhancer.enabled);
console.log('Enhancer methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(enhancer)));
console.log('needsEnhancement method exists:', typeof enhancer.needsEnhancement);
console.log('enhanceEvent method exists:', typeof enhancer.enhanceEvent);
