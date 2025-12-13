const fs = require('fs');
const path = require('path');

const dir = 'contracts';
try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.clar'));

    files.forEach(file => {
        const filePath = path.join(dir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        // Check if CRLF exists
        if (content.includes('\r\n')) {
            content = content.replace(/\r\n/g, '\n');
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Fixed LF in ${file}`);
        } else {
            console.log(`Already LF: ${file}`);
        }
    });
} catch (e) {
    console.error("Error fixing lines:", e);
}
