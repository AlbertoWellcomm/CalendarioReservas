document.addEventListener('DOMContentLoaded', () => {
    
    // Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const calendarEl = document.getElementById('calendar');
    const tooltip = document.getElementById('booking-tooltip');
    
    // Notes Features Objects
    const exportBtn = document.getElementById('export-notes-btn');
    const importBtn = document.getElementById('import-notes-btn');
    const importFile = document.getElementById('import-file');
    const ttLocalNote = document.getElementById('tt-local-note');
    const ttLocalNoteDisplay = document.getElementById('tt-local-note-display');
    const ttSaveNote = document.getElementById('tt-save-note');
    let currentEventKey = null;
    let isOverTooltip = false;
    let hideTooltipTimeout = null;
    
    // UI Tooltip Elements
    const ttApt = document.getElementById('tt-apt');
    const ttDates = document.getElementById('tt-dates');
    const ttBroker = document.getElementById('tt-broker');
    const ttPax = document.getElementById('tt-pax');
    const ttBruto = document.getElementById('tt-bruto');
    const ttComisiones = document.getElementById('tt-comisiones');
    const ttNeto = document.getElementById('tt-neto');
    const ttNotas = document.getElementById('tt-notas');

    // Apartment Colors
    const aptColors = {
        'loft': 'var(--color-apt-1)',
        '1st_floor': 'var(--color-apt-2)',
        'default': 'var(--color-apt-3)'
    };
    
    let calendar;

    // Initialize Calendar
    function initCalendar(events = []) {
        if (calendar) {
            calendar.destroy();
        }
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'es',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,dayGridWeek'
            },
            buttonText: {
                today: 'Hoy',
                month: 'Mes',
                week: 'Semana'
            },
            events: events,
            eventClick: (info) => {
                handleEventClick(info);
                // Also capture data needed for the tax receipt
                receiptData = {
                    apt:       info.event.extendedProps.apt,
                    pax:       info.event.extendedProps.pax,
                    startISO:  info.event.start ? info.event.start.toISOString() : '',
                    salidaISO: info.event.extendedProps.salidaDate || ''
                };
            },
            displayEventTime: false,
            eventDisplay: 'block'
        });
        calendar.render();
    }
    
    // Touch/Click Tooltip Handlers
    function handleEventClick(info) {
        const props = info.event.extendedProps;
        
        // Populate
        ttApt.textContent = props.apt;
        
        let aptKey = props.apt.toLowerCase().replace(' ', '_');
        ttApt.style.backgroundColor = aptColors[aptKey] || aptColors['default'];
        
        const start = info.event.start ? formatDateReadable(info.event.start) : '?';
        const realEnd = props.salidaDate ? formatDateReadable(new Date(props.salidaDate)) : '?';
        ttDates.textContent = `${start} → ${realEnd}`;
        
        if (ttBroker) ttBroker.textContent = props.broker || '-';
        if (ttPax) ttPax.textContent = props.pax || '-';
        if (ttBruto) ttBruto.textContent = props.bruto !== undefined ? formatCurrency(props.bruto) : '-';
        if (ttComisiones) ttComisiones.textContent = props.comisiones !== undefined ? formatCurrency(props.comisiones) : '-';
        if (ttNeto) ttNeto.textContent = props.neto !== undefined ? formatCurrency(props.neto) : '-';
        if (ttNotas) ttNotas.textContent = props.notas || '-';
        
        const startStr = info.event.start ? formatDateISO(info.event.start) : '?';
        const endStr = info.event.end ? formatDateISO(info.event.end) : '?';
        currentEventKey = `note_${props.apt}_${startStr}_${endStr}`;
        const savedNote = localStorage.getItem(currentEventKey) || '';
        
        if (ttLocalNote) {
            ttLocalNote.value = savedNote;
            if (ttSaveNote) {
                ttSaveNote.textContent = "Save Note";
                ttSaveNote.classList.remove('success');
            }
        }
        if (ttLocalNoteDisplay) {
            ttLocalNoteDisplay.textContent = savedNote || '-';
        }
        
        // Position & Show - Centered horizontally for tablet ease
        tooltip.classList.remove('hidden');
        
        // Simple positioning near the click
        const x = info.jsEvent.pageX - 100;
        const y = info.jsEvent.pageY + 20;
        tooltip.style.left = `${Math.max(10, x)}px`;
        tooltip.style.top = `${y}px`;
        
        requestAnimationFrame(() => {
            tooltip.classList.add('show');
        });
        
        // Prevent immediate close
        info.jsEvent.stopPropagation();
    }

    // Close tooltip when touching outside
    document.addEventListener('click', (e) => {
        if (!tooltip.classList.contains('hidden') && !tooltip.contains(e.target)) {
            tooltip.classList.remove('show');
            setTimeout(() => { tooltip.classList.add('hidden'); }, 200);
        }
    });
    
    function formatDateReadable(date) {
        const options = { day: 'numeric', month: 'short' };
        return date.toLocaleDateString('es-ES', options);
    }
    
    function formatCurrency(val) {
        if (isNaN(val)) return val;
        return Number(val).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
    }

    function findCol(row, keywords) {
        for (const kw of keywords) {
            // Exact match first
            if (row[kw] !== undefined && row[kw] !== null && row[kw] !== '') return row[kw];
            // Substring match (handles leading/trailing spaces, composite names)
            const matchingKey = Object.keys(row).find(k => k.includes(kw));
            if (matchingKey && row[matchingKey] !== undefined && row[matchingKey] !== '') return row[matchingKey];
        }
        return undefined;
    }

    // Process File Data
    function processWorkbook(workbook) {
        let allEvents = [];
        
        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(sheet);
            
            let aptKey = sheetName.toLowerCase().replace(' ', '_');
            let color = aptColors[aptKey] || aptColors['default'];
            
            data.forEach((row, index) => {
                // Determine property keys mapping depending on case sensitivity
                const rowUpper = {};
                for(let key in row) {
                    rowUpper[key.trim().toLowerCase()] = row[key];
                }
                
                const entrada = rowUpper['entrada'];
                const salida = rowUpper['salida'];
                
                if (entrada || salida) { // If at least one exists, try to parse
                    let startDate = parseExcelDate(entrada);
                    let endDate = parseExcelDate(salida);
                    
                    if (startDate && endDate) {
                        // FullCalendar allDay end is exclusive. To make the bar end ON the exit day
                        // and visually share the square if another guest enters the same day,
                        // we add +1 day to the calendar's end date representation.
                        let calendarEnd = new Date(endDate);
                        calendarEnd.setDate(calendarEnd.getDate() + 1);

                        allEvents.push({
                            title: `${sheetName} (${rowUpper['pax'] || '?'} Pax)`,
                            start: formatDateISO(startDate),
                            end: formatDateISO(calendarEnd), 
                            allDay: true,
                            backgroundColor: color,
                            extendedProps: {
                                apt: sheetName,
                                salidaDate: endDate.toISOString(), // store real exit date for tooltip
                                broker: findCol(rowUpper, ['broker', 'canal', 'plataforma', 'agencia', 'cliente']),
                                pax: rowUpper['pax'],
                                bruto: rowUpper['bruto'],
                                comisiones: rowUpper['comisiones'],
                                neto: rowUpper['neto'],
                                notas: rowUpper['notas'] || rowUpper['notes']
                            }
                        });
                    }
                }
            });
        });

        initCalendar(allEvents);
    }
    
    // Parse Date helper for various inputs from SheetJs
    function parseExcelDate(val) {
        if (val instanceof Date) {
            return val;
        }
        if (typeof val === 'number') {
            // Excel serial date formula
            let date = new Date((val - (25567 + 2)) * 86400 * 1000);
            return date;
        }
        if (typeof val === 'string') {
            let str = val.toLowerCase().trim();
            // Try explicit JS date parse first
            let dObj = new Date(str);
            if (!isNaN(dObj.getTime()) && str.length > 5 && !str.match(/^[0-9]+$/)) {
                return dObj;
            }
            
            // Numeric excel date as string
            if (str.match(/^[0-9]{5}$/)) {
                return new Date((parseInt(str, 10) - (25567 + 2)) * 86400 * 1000);
            }
            
            // Try to match DD-MMM-YY or DD/MMM/YYYY in Spanish
            const monthMap = {
                'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
                'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
            };
            
            // Allow DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
            str = str.replace(/[-.]/g, '/').replace(/\s+/g, '/');
            let parts = str.split('/');
            
            if (parts.length >= 2) {
                let d = parseInt(parts[0], 10);
                
                let mStr = parts[1].replace(/[^a-z0-9]/g, '');
                let m = isNaN(parseInt(mStr, 10)) ? monthMap[mStr.substring(0,3)] : parseInt(mStr, 10) - 1;
                
                let y = new Date().getFullYear();
                if (parts.length >= 3) {
                    let yStr = parts[2].replace(/[^\d]/g, '');
                    if(yStr.length > 0) {
                        y = parseInt(yStr, 10);
                        if (y < 100) y += 2000;
                    }
                }
                
                if (!isNaN(d) && m !== undefined && !isNaN(m) && !isNaN(y)) {
                    return new Date(y, m, d);
                }
            }
        }
        return null;
    }
    
    function formatDateISO(date) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    // File Drop & Load Logic
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });
    
    function handleFile(file) {
        if (!file.name.match(/\.(ods|xlsx|xls)$/i)) {
            alert('Please upload a valid spreadsheet file (.ods, .xlsx, .xls)');
            return;
        }
        
        const uiTextspan = dropZone.querySelector('span');
        uiTextspan.textContent = `Loaded: ${file.name}`;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            // Save internally for offline persistence
            if (window.localforage) {
                localforage.setItem('saved_ods_file', data);
            }
            dropZone.style.display = 'none'; // hide drop zone after load
            
            const workbook = XLSX.read(data, {type: 'array', cellDates: true, cellNF: false, cellText: false});
            processWorkbook(workbook);
        };
        reader.readAsArrayBuffer(file);
    }
    
    // Wire up "Cambiar Archivo" button
    const changeFileBtn = document.getElementById('change-file-btn');
    if (changeFileBtn) {
        changeFileBtn.addEventListener('click', () => fileInput.click());
    }
    
    // Auto-load saved file on startup
    if (window.localforage) {
        localforage.getItem('saved_ods_file').then(data => {
            if (data) {
                dropZone.style.display = 'none';
                const workbook = XLSX.read(data, {type: 'array', cellDates: true, cellNF: false, cellText: false});
                processWorkbook(workbook);
            }
        }).catch(e => console.error(e));
    }
    
    // Export/Import Local Notes Logic
    if (ttSaveNote && ttLocalNote) {
        ttSaveNote.addEventListener('click', () => {
             if(currentEventKey) {
                 localStorage.setItem(currentEventKey, ttLocalNote.value);
                 ttSaveNote.textContent = "¡Guardado!";
                 ttSaveNote.classList.add('success');
             }
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            let notes = {};
            for(let i=0; i<localStorage.length; i++){
                let k = localStorage.key(i);
                if (k && k.startsWith('note_')) {
                    notes[k] = localStorage.getItem(k);
                }
            }
            if (Object.keys(notes).length === 0) {
                alert("No hay notas guardadas para exportar.");
                return;
            }
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(notes));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "calendar_notes.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        });
    }
    
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => importFile.click());
        importFile.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    try {
                        const notes = JSON.parse(event.target.result);
                        let count = 0;
                        for(let k in notes) {
                            if (k.startsWith('note_')) {
                                localStorage.setItem(k, notes[k]);
                                count++;
                            }
                        }
                        alert(`Se importaron ${count} notas correctamente.`);
                    } catch(err) {
                        alert("Error al leer el archivo de notas.");
                    }
                    e.target.value = ""; // reset
                };
                reader.readAsText(e.target.files[0]);
            }
        });
    }

    // ============================
    // TOURISTIC TAX RECEIPT LOGIC
    // ============================
    let RATE_PER_PERSON_NIGHT = parseFloat(localStorage.getItem('touristic_tax_rate')) || 1.75;
    const MAX_NIGHTS = 7;

    const receiptModal = document.getElementById('receipt-modal');
    const receiptPrintBtn = document.getElementById('receipt-print-btn');
    const receiptCloseBtn = document.getElementById('receipt-close-btn');
    const ttPrintReceipt = document.getElementById('tt-print-receipt');

    // Generate incremental receipt ID: YYYY-NNN (resets each year)
    function getNextReceiptId() {
        const year = new Date().getFullYear();
        const counterKey = `receipt_counter_${year}`;
        let counter = parseInt(localStorage.getItem(counterKey) || '0', 10) + 1;
        localStorage.setItem(counterKey, counter);
        return `${year}-${String(counter).padStart(3, '0')}`;
    }

    // Calculate taxable nights (capped at MAX_NIGHTS)
    function calcNights(startISO, salidaISO) {
        const ms = new Date(salidaISO) - new Date(startISO);
        const raw = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
        return Math.min(raw, MAX_NIGHTS);
    }

    // ============================
    // TOURISTIC TAX RECEIPT TRANSLATIONS
    // ============================
    const receiptI18n = {
        es: {
            title: "Recibo Tasa Turística",
            apt: "Apartamento:",
            checkin: "Check-in:",
            checkout: "Check-out:",
            pax: "Nº de personas (>16 años):",
            nights: "Noches (máx. 7):",
            rate: "Tarifa por persona/noche:",
            total: "TOTAL:",
            footer: "Gracias por su visita.",
            btnPrint: "Imprimir",
            btnClose: "Cerrar",
            maxSuffix: " (máx.)",
            locale: "es-ES"
        },
        en: {
            title: "Touristic Tax Receipt",
            apt: "Apartment:",
            checkin: "Check-in:",
            checkout: "Check-out:",
            pax: "Number of persons (>16 years):",
            nights: "Nights (max. 7):",
            rate: "Rate per person/night:",
            total: "TOTAL:",
            footer: "Thank you for your stay.",
            btnPrint: "Print",
            btnClose: "Close",
            maxSuffix: " (max.)",
            locale: "en-GB"
        }
    };

    let currentReceiptLang = 'es';
    let receiptActiveData = { apt: '', startISO: '', salidaISO: '' };

    const langSelect = document.getElementById('receipt-lang-select');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => {
            currentReceiptLang = e.target.value;
            applyReceiptTranslations();
        });
    }

    function applyReceiptTranslations() {
        const t = receiptI18n[currentReceiptLang];
        document.getElementById('r-title-txt').textContent = t.title;
        document.getElementById('r-lbl-apt').textContent = t.apt;
        document.getElementById('r-lbl-checkin').textContent = t.checkin;
        document.getElementById('r-lbl-checkout').textContent = t.checkout;
        document.getElementById('r-lbl-pax').textContent = t.pax;
        document.getElementById('r-lbl-nights').textContent = t.nights;
        document.getElementById('r-lbl-rate').textContent = t.rate;
        document.getElementById('r-lbl-total').textContent = t.total;
        document.getElementById('r-footer-txt').textContent = t.footer;
        document.getElementById('r-btn-print').textContent = t.btnPrint;
        document.getElementById('r-btn-close').textContent = t.btnClose;

        if (receiptModal && !receiptModal.classList.contains('hidden') && receiptActiveData.startISO) {
            document.getElementById('r-checkin').textContent = formatReceiptDate(receiptActiveData.startISO);
            document.getElementById('r-checkout').textContent = formatReceiptDate(receiptActiveData.salidaISO);
            document.getElementById('r-nights').textContent = currentNights + (currentNights === MAX_NIGHTS ? t.maxSuffix : '');
            updateReceiptTotal();
        }
    }

    // Format ISO date for display on the receipt (locale dependent)
    function formatReceiptDate(isoStr) {
        if (!isoStr) return '-';
        const d = new Date(isoStr);
        const loc = receiptI18n[currentReceiptLang].locale;
        return d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    let currentNights = 0;

    // Recalculates total based on current input pax and nights
    function updateReceiptTotal() {
        const paxInput = document.getElementById('r-pax');
        const pax = parseInt(paxInput.value, 10) || 0;
        const total = pax * currentNights * RATE_PER_PERSON_NIGHT;
        const loc = receiptI18n[currentReceiptLang].locale;
        document.getElementById('r-total').textContent =
            total.toLocaleString(loc, { style: 'currency', currency: 'EUR' });
    }

    // Open the receipt modal and fill in the data
    function openReceipt(aptName, paxCount, startISO, salidaISO) {
        receiptActiveData = { apt: aptName, startISO, salidaISO };
        const pax = parseInt(paxCount, 10) || 0;
        currentNights = calcNights(startISO, salidaISO);
        const receiptId = getNextReceiptId();
        const t = receiptI18n[currentReceiptLang];

        document.getElementById('r-id').textContent       = receiptId;
        document.getElementById('r-apt').textContent      = aptName || '-';
        document.getElementById('r-checkin').textContent  = formatReceiptDate(startISO);
        document.getElementById('r-checkout').textContent = formatReceiptDate(salidaISO);
        
        const rateTxt = document.getElementById('r-rate-txt');
        if (rateTxt) {
            rateTxt.textContent = RATE_PER_PERSON_NIGHT.toLocaleString(t.locale, { style: 'currency', currency: 'EUR' });
        }
        
        const paxInput = document.getElementById('r-pax');
        if (paxInput) paxInput.value = pax;
        
        document.getElementById('r-nights').textContent   = currentNights + (currentNights === MAX_NIGHTS ? t.maxSuffix : '');
        
        updateReceiptTotal();

        if (receiptModal) receiptModal.classList.remove('hidden');
    }

    // Add event listener to recalculate total when pax is modified
    const rpaxInputEl = document.getElementById('r-pax');
    if (rpaxInputEl) {
        rpaxInputEl.addEventListener('input', updateReceiptTotal);
    }

    // Store current booking data on the print button for access at click time
    let receiptData = {};

    // receiptData is captured by the combined eventMouseEnter defined in initCalendar

    // Wire up print receipt button in tooltip
    if (ttPrintReceipt) {
        ttPrintReceipt.addEventListener('click', () => {
            // Close tooltip
            tooltip.classList.remove('show');
            tooltip.classList.add('hidden');
            isOverTooltip = false;
            openReceipt(receiptData.apt, receiptData.pax, receiptData.startISO, receiptData.salidaISO);
        });
    }

    // Close modal on button or overlay click
    if (receiptCloseBtn) {
        receiptCloseBtn.addEventListener('click', () => receiptModal.classList.add('hidden'));
    }
    if (receiptModal) {
        receiptModal.addEventListener('click', (e) => {
            if (e.target === receiptModal) receiptModal.classList.add('hidden');
        });
    }

    // Print receipt and save to registry
    if (receiptPrintBtn) {
        receiptPrintBtn.addEventListener('click', () => {
            // Save receipt to registry
            const hist = JSON.parse(localStorage.getItem('emitted_receipts') || '[]');
            const paxInput = document.getElementById('r-pax');
            const pax = parseInt(paxInput.value, 10) || 0;
            const total = pax * currentNights * RATE_PER_PERSON_NIGHT;
            
            const record = {
                id: document.getElementById('r-id').textContent,
                apt: receiptActiveData.apt || '-',
                checkin: receiptActiveData.startISO,
                pax: pax,
                nights: currentNights,
                total: total,
                dateEmitted: new Date().toISOString()
            };
            hist.push(record);
            localStorage.setItem('emitted_receipts', JSON.stringify(hist));
            
            window.print();
        });
    }

    // ============================
    // RECEIPT REGISTRY LOGIC
    // ============================
    const registryBtn = document.getElementById('registry-btn');
    const registryModal = document.getElementById('registry-modal');
    const registryCloseBtn = document.getElementById('registry-close-btn');
    const registryExportBtn = document.getElementById('registry-export-btn');
    const registryTbody = document.getElementById('registry-table-body');
    
    let currentFilteredReceipts = [];

    function openRegistry() {
        if (!registryModal) return;
        const currentYear = new Date().getFullYear();
        const allHist = JSON.parse(localStorage.getItem('emitted_receipts') || '[]');
        
        // Filter to current year based on checkin date (or emitted date if checkin is missing)
        currentFilteredReceipts = allHist.filter(r => {
            const d = new Date(r.checkin || r.dateEmitted);
            return d.getFullYear() === currentYear;
        });
        
        // Sort descending by emission date
        currentFilteredReceipts.sort((a,b) => new Date(b.dateEmitted) - new Date(a.dateEmitted));

        let p1Total = 0, p1Count = 0; // Apr - Oct (months 3 to 9)
        let p2Total = 0, p2Count = 0; // Nov - Mar (months 10,11,0,1,2)

        registryTbody.innerHTML = '';
        currentFilteredReceipts.forEach(r => {
            const chkDate = new Date(r.checkin || r.dateEmitted);
            const m = chkDate.getMonth();
            if (m >= 3 && m <= 9) {
                p1Total += r.total;
                p1Count++;
            } else {
                p2Total += r.total;
                p2Count++;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;">${r.id}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;">${formatReceiptDate(r.checkin)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;">${r.apt}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;">${r.pax}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;">${r.nights}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; font-weight: 600;">${r.total.toLocaleString('es-ES', {style:'currency', currency:'EUR'})}</td>
            `;
            registryTbody.appendChild(tr);
        });

        document.getElementById('reg-total-p1').textContent = p1Total.toLocaleString('es-ES', {style:'currency', currency:'EUR'});
        document.getElementById('reg-count-p1').textContent = `${p1Count} recibos`;
        document.getElementById('reg-total-p2').textContent = p2Total.toLocaleString('es-ES', {style:'currency', currency:'EUR'});
        document.getElementById('reg-count-p2').textContent = `${p2Count} recibos`;

        registryModal.classList.remove('hidden');
    }

    if (registryBtn) registryBtn.addEventListener('click', openRegistry);
    if (registryCloseBtn) registryCloseBtn.addEventListener('click', () => registryModal.classList.add('hidden'));
    
    if (registryExportBtn) {
        registryExportBtn.addEventListener('click', () => {
            if (currentFilteredReceipts.length === 0) {
                alert("No hay recibos para exportar en este año.");
                return;
            }
            let csv = "ID,Fecha Check-in,Alojamiento,Pax,Noches,Total(EUR),Fecha Emision\n";
            currentFilteredReceipts.forEach(r => {
                csv += `"${r.id}","${formatReceiptDate(r.checkin)}","${r.apt}","${r.pax}","${r.nights}","${r.total.toFixed(2)}","${new Date(r.dateEmitted).toLocaleString('es-ES')}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `recibos_${new Date().getFullYear()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    if (registryModal) {
        registryModal.addEventListener('click', (e) => {
            if (e.target === registryModal) registryModal.classList.add('hidden');
        });
    }

    // ============================
    // TAX CONFIGURATION LOGIC
    // ============================
    const configBtn = document.getElementById('config-btn');
    const configModal = document.getElementById('config-modal');
    const configCloseBtn = document.getElementById('config-close-btn');
    const configSaveBtn = document.getElementById('config-save-btn');
    const configResetBtn = document.getElementById('config-reset-btn');
    const configTaxRateInput = document.getElementById('config-tax-rate');

    if (configBtn) {
        configBtn.addEventListener('click', () => {
            if (configTaxRateInput) {
                configTaxRateInput.value = RATE_PER_PERSON_NIGHT;
            }
            if (configModal) configModal.classList.remove('hidden');
        });
    }

    if (configCloseBtn) {
        configCloseBtn.addEventListener('click', () => {
            if (configModal) configModal.classList.add('hidden');
        });
    }

    if (configSaveBtn) {
        configSaveBtn.addEventListener('click', () => {
            RATE_PER_PERSON_NIGHT = parseFloat(configTaxRateInput.value) || 1.75;
            localStorage.setItem('touristic_tax_rate', RATE_PER_PERSON_NIGHT);
            
            // Re-render rate & total if receipt is currently open
            if (receiptModal && !receiptModal.classList.contains('hidden')) {
                const rateTxt = document.getElementById('r-rate-txt');
                if (rateTxt) {
                    const loc = receiptI18n[currentReceiptLang].locale;
                    rateTxt.textContent = RATE_PER_PERSON_NIGHT.toLocaleString(loc, { style: 'currency', currency: 'EUR' });
                }
                updateReceiptTotal();
            }
            if (configModal) configModal.classList.add('hidden');
        });
    }

    if (configResetBtn) {
        configResetBtn.addEventListener('click', () => {
            const year = new Date().getFullYear();
            if (confirm(`¿Seguro que quieres reiniciar el contador a 1 para el año ${year}?`)) {
                localStorage.setItem(`receipt_counter_${year}`, '0');
                if (configModal) configModal.classList.add('hidden');
            }
        });
    }

    if (configModal) {
        configModal.addEventListener('click', (e) => {
            if (e.target === configModal) configModal.classList.add('hidden');
        });
    }

    // Initial empty Calendar
    initCalendar();

    // receiptData is populated by the patched eventMouseEnter in initCalendar
});
