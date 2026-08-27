const fs = require('fs');
let code = fs.readFileSync('src/services/cardService.ts', 'utf8');

code = code.replace(/physicalCardPrice: number \| null;/g, "physicalCardPrice: number | null;\n  urgentPhysicalCardPrice: number | null;");
code = code.replace(/physicalCardPrice: null,/g, "physicalCardPrice: null,\n  urgentPhysicalCardPrice: null,");
code = code.replace(/updatePricing\(params: \{ virtualCardPrice: number \| null; physicalCardPrice: number \| null; currency\?: string \}\)/g, "updatePricing(params: { virtualCardPrice: number | null; physicalCardPrice: number | null; urgentPhysicalCardPrice: number | null; currency?: string })");
code = code.replace(/physicalCardPrice: \(params\.physicalCardPrice !== null && params\.physicalCardPrice > 0\) \? Number\(params\.physicalCardPrice\) : null,/g, "physicalCardPrice: (params.physicalCardPrice !== null && params.physicalCardPrice > 0) ? Number(params.physicalCardPrice) : null,\n      urgentPhysicalCardPrice: (params.urgentPhysicalCardPrice !== null && params.urgentPhysicalCardPrice > 0) ? Number(params.urgentPhysicalCardPrice) : null,");
code = code.replace(/physicalCardPrice: payload\.physicalCardPrice,/g, "physicalCardPrice: payload.physicalCardPrice,\n      urgentPhysicalCardPrice: payload.urgentPhysicalCardPrice,");

fs.writeFileSync('src/services/cardService.ts', code);
