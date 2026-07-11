const fs = require('fs');

function fixFile(file) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    
    // Fix garbled emojis
    content = content.replace(/'o\.'/g, `'\\u2705'`);
    content = content.replace(/'\?O'/g, `'\\u274C'`);
    content = content.replace(/'\?\"'/g, `'\\u2754'`);
    content = content.replace(/Y-\?/g, '\\uD83D\\uDDA8\\uFE0F');
    content = content.replace(/Y-'\?/g, '\\uD83D\\uDDD1\\uFE0F');
    
    // Try other corrupted sequences
    content = content.replace(/'o\.'/g, `'\\u2705'`);
    content = content.replace(/'\?O'/g, `'\\u274C'`);
    content = content.replace(/'\?\"'/g, `'\\u2754'`);
    content = content.replace(/Y-\?/g, '\\uD83D\\uDDA8\\uFE0F');
    content = content.replace(/Y-'\?/g, '\\uD83D\\uDDD1\\uFE0F');

    content = content.replace(/'✅'/g, `'\\u2705'`);
    content = content.replace(/'❌'/g, `'\\u274C'`);
    content = content.replace(/'❔'/g, `'\\u2754'`);
    content = content.replace(/🖨️/g, '\\uD83D\\uDDA8\\uFE0F');
    content = content.replace(/🗑️/g, '\\uD83D\\uDDD1\\uFE0F');

    // Fix app-tablet.js dayEvents issue
    if (file.includes('app-tablet.js')) {
        // Ensure calendar.getEvents() is used
        if (content.includes(\"typeof dayEvents !== 'undefined' ? dayEvents : []\")) {
            content = content.replace(/typeof dayEvents !== 'undefined' \? dayEvents : \[\];/g, 
                \"typeof calendar !== 'undefined' && calendar ? calendar.getEvents() : [];\");
        }
        
        // Update the match function to look at extendedProps for calendar events, like in app.js
        content = content.replace(/ev\.apt/g, \"(ev.extendedProps ? ev.extendedProps.apt : ev.apt)\");
        content = content.replace(/ev\.start === checkinDateStr/g, \"(ev.startStr === checkinDateStr || (ev.start && formatDateISO(ev.start) === checkinDateStr))\");
        content = content.replace(/match\.tasaPagada/g, \"(match.extendedProps ? match.extendedProps.tasaPagada : match.tasaPagada)\");
        
        // Also fix the reprintReceipt match logic in app-tablet.js if it used dayEvents
        content = content.replace(/match\.end/g, \"(match.endStr || match.end)\");
    }

    fs.writeFileSync(file, content, 'utf8');
    console.log(file + ' updated');
}

fixFile('app.js');
fixFile('app-tablet.js');
