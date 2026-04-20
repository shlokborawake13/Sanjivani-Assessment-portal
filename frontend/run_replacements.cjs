const fs = require("fs");
const path = require("path");

const dir = "c:/Users/boraw/Desktop/assessment/frontend/src/layouts";
const sidebarPath = "c:/Users/boraw/Desktop/assessment/frontend/src/components/Sidebar.jsx";

function modifyFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, "utf-8");
    
    // Desktop layout with Role
    content = content.replace(
        /<div className="flex items-center gap-2\.5 animate-fade-in">\s*<img src="\/logo\.png" alt="Sanjivani CareerSpace" className="h-8 w-auto object-contain" \/>\s*<div>\s*<span className="text-sm font-semibold text-primary tracking-tight block">Sanjivani CareerSpace<\/span>\s*<span className="text-\[9px\] font-semibold text-accent uppercase tracking-wider">(.*?)<\/span>\s*<\/div>\s*<\/div>/g,
        (m, p1) => `<div className="flex items-center gap-3 animate-fade-in">\n              <img src="/logo.png" alt="Sanjivani CareerSpace" className="h-11 w-auto object-contain" />\n              <div className="flex flex-col justify-center">\n                <span className="text-[17px] font-bold text-primary tracking-tight leading-none mb-1">Sanjivani CareerSpace</span>\n                <span className="text-[10px] font-bold text-accent uppercase tracking-widest leading-none block">${p1}</span>\n              </div>\n            </div>`
    );

    // Desktop layout without Role (Sidebar.jsx)
    content = content.replace(
        /<div className="flex items-center gap-2\.5 animate-fade-in">\s*<img src="\/logo\.png" alt="Sanjivani CareerSpace" className="h-8 w-auto object-contain" \/>\s*<span className="text-sm font-semibold text-primary tracking-tight">Sanjivani CareerSpace<\/span>\s*<\/div>/g,
        `<div className="flex items-center gap-3 animate-fade-in">\n            <img src="/logo.png" alt="Sanjivani CareerSpace" className="h-11 w-auto object-contain" />\n            <div className="flex flex-col justify-center">\n              <span className="text-[17px] font-bold text-primary tracking-tight leading-none">Sanjivani CareerSpace</span>\n            </div>\n          </div>`
    );

    // Mobile Top Bar
    content = content.replace(
        /<div className="lg:hidden flex items-center gap-2">\s*<img src="\/logo\.png" alt="Sanjivani CareerSpace" className="h-7 w-auto object-contain" \/>\s*<span className="text-sm font-semibold text-primary">(.*?)<\/span>\s*<\/div>/g,
        (m, p1) => `<div className="lg:hidden flex items-center gap-2.5">\n              <img src="/logo.png" alt="Sanjivani CareerSpace" className="h-9 w-auto object-contain" />\n              <div className="flex flex-col justify-center">\n                <span className="text-[15px] font-bold text-primary leading-none ${p1 !== "Sanjivani CareerSpace" ? "mb-1" : ""}">Sanjivani CareerSpace</span>\n                ${ p1 !== "Sanjivani CareerSpace" ? `<span className="text-[9px] font-bold text-accent uppercase tracking-widest leading-none block">${p1}</span>\n              ` : ""}</div>\n            </div>`
    );

    // Mobile Sidebar Overlay
    content = content.replace(
        /<div className="flex items-center gap-2\.5">\s*<img src="\/logo\.png" alt="Sanjivani CareerSpace" className="h-8 w-auto(?: object-contain)?" \/>\s*<span className="text-sm font-semibold text-primary">(.*?)<\/span>\s*<\/div>/g,
        (m, p1) => `<div className="flex items-center gap-3">\n                  <img src="/logo.png" alt="Sanjivani CareerSpace" className="h-10 w-auto object-contain" />\n                  <div className="flex flex-col justify-center">\n                    <span className="text-[17px] font-bold text-primary leading-none ${p1 !== "Sanjivani CareerSpace" ? "mb-1" : ""}">Sanjivani CareerSpace</span>\n                    ${ p1 !== "Sanjivani CareerSpace" ? `<span className="text-[10px] font-bold text-accent uppercase tracking-widest leading-none block">${p1}</span>\n                  ` : ""}</div>\n                </div>`
    );
    
    fs.writeFileSync(filePath, content, "utf-8");
}

fs.readdirSync(dir).forEach(file => {
    modifyFile(path.join(dir, file));
});
modifyFile(sidebarPath);
console.log("done layout replacements");
