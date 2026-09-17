import os
import glob
import re

sources_dir = r"c:\Users\Hari\Documents\R2R-F8\R2R-F8\R2R-F5\R2R-F5\sources"

for filepath in glob.glob(os.path.join(sources_dir, '*.js')):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Remove the broken backslashed require
    content = re.sub(r'const \{ safeText \} = require\(\\\'../js/redact\.js\\\'\);\n', '', content)
    
    lines = content.split('\n')
    new_lines = []
    found = False
    for line in lines:
        if "const { safeText } = require('../js/redact.js');" in line or 'const { safeText } = require("../js/redact.js");' in line:
            if not found:
                new_lines.append(line)
                found = True
        else:
            new_lines.append(line)
            
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_lines))
