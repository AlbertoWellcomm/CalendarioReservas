document.addEventListener('DOMContentLoaded', () => {

    const PAGE_MODE = window.PAGE_MODE || 'readonly';
    const IS_ADMIN  = PAGE_MODE === 'admin';

    // ── Element refs ──────────────────────────────────────────────────────────
    const dropZone   = document.getElementById('drop-zone');
    const fileInput  = document.getElementById('file-input');
    const calendarEl = document.getElementById('calendar');
    const tooltip    = document.getElementById('booking-tooltip');

    const exportBtn          = document.getElementById('export-notes-btn');
    const importBtn          = document.getElementById('import-notes-btn');
    const importFile         = document.getElementById('import-file');
    const ttLocalNote        = document.getElementById('tt-local-note');
    const ttLocalNoteDisplay = document.getElementById('tt-local-note-display');
    const ttSaveNote         = document.getElementById('tt-save-note');

    const ttApt        = document.getElementById('tt-apt');
    const ttDates      = document.getElementById('tt-dates');
    const ttBroker     = document.getElementById('tt-broker');
    const ttPax        = document.getElementById('tt-pax');
    const ttBruto      = document.getElementById('tt-bruto');
    const ttComisiones = document.getElementById('tt-comisiones');
    const ttNeto       = document.getElementById('tt-neto');
    const ttNotas      = document.getElementById('tt-notas');

    // Admin CRUD
    const addBookingBtn    = document.getElementById('add-booking-btn');
    const bookingModal     = document.getElementById('booking-modal');
    const bookingForm      = document.getElementById('booking-form');
    const bookingModalTitle= document.getElementById('booking-modal-title');
    const bfApt            = document.getElementById('bf-apt');
    const bfEntrada        = document.getElementById('bf-entrada');
    const bfSalida         = document.getElementById('bf-salida');
    const bfBroker         = document.getElementById('bf-broker');
    const bfPax            = document.getElementById('bf-pax');
    const bfBruto          = document.getElementById('bf-bruto');
    const bfComisiones     = document.getElementById('bf-comisiones');
    const bfNeto           = document.getElementById('bf-neto');
    const bfNotas          = document.getElementById('bf-notas');
    const ttEditBtn        = document.getElementById('tt-edit-booking');
    const ttDeleteBtn      = document.getElementById('tt-delete-booking');

    // Receipt
    const receiptModal   = document.getElementById('receipt-modal');
    const receiptPrintBtn= document.getElementById('receipt-print-btn');
    const receiptCloseBtn= document.getElementById('receipt-close-btn');
    const ttPrintReceipt = document.getElementById('tt-print-receipt');

    // Registry
    const registryBtn       = document.getElementById('registry-btn');
    const registryModal     = document.getElementById('registry-modal');
    const registryCloseBtn  = document.getElementById('registry-close-btn');
    const registryExportBtn = document.getElementById('registry-export-btn');
    const registryTbody     = document.getElementById('registry-table-body');

    // Config
    const configBtn        = document.getElementById('config-btn');
    const configModal      = document.getElementById('config-modal');
    const configCloseBtn   = document.getElementById('config-close-btn');
    const configSaveBtn    = document.getElementById('config-save-btn');
    const configResetBtn   = document.getElementById('config-reset-btn');
    const configTaxRateInput = document.getElementById('config-tax-rate');

    // Reports
    const reportsBtn       = document.getElementById('reports-btn');
    const reportsModal     = document.getElementById('reports-modal');
    const reportsCloseBtn  = document.getElementById('reports-close-btn');
    const reportsMonthSel  = document.getElementById('reports-month');
    const reportsYearSel   = document.getElementById('reports-year');
    const reportsTableBody = document.getElementById('reports-table-body');
    const reportsTableFoot = document.getElementById('reports-table-foot');
    const reportsAnnualTitle= document.getElementById('reports-annual-title');
    const reportsAnnualBody = document.getElementById('reports-annual-body');
    const reportsBrokerTitle= document.getElementById('reports-broker-title');
    const reportsBrokerBody = document.getElementById('reports-broker-body');

    // ── State ─────────────────────────────────────────────────────────────────
    const aptColors = {
        'loft':      'var(--color-apt-1)',
        '1st_floor': 'var(--color-apt-2)',
        'default':   'var(--color-apt-3)'
    };

    let calendar               = null;
    let currentEventKey        = null;
    let currentBookingId       = null;
    let currentEditingBookingId= null;
    let isOverTooltip          = false;
    let hideTooltipTimeout     = null;
    let receiptData            = {};
    let unsubscribeBookings    = null;
    let RATE_PER_PERSON_NIGHT  = 1.75; // Will be updated from Firestore
    const MAX_NIGHTS           = 7;
    let currentNights          = 0;
    let currentReceiptLang     = 'es';
    let receiptActiveData      = { apt:'', startISO:'', salidaISO:'' };
    let currentFilteredReceipts= [];
    let allBookings            = []; // Store all bookings for reporting

    // ── Firebase helpers ──────────────────────────────────────────────────────

    function initFirebaseSync() {
        firebase.auth().onAuthStateChanged(async user => {
            if (user) {
                console.log('Autenticado como:', user.email);
                
                // Fetch and listen for global config (tax rate)
                db.collection('settings').doc('global_config').onSnapshot(doc => {
                    if (doc.exists) {
                        const data = doc.data();
                        if (data.tax_rate !== undefined) {
                            RATE_PER_PERSON_NIGHT = parseFloat(data.tax_rate);
                            if (receiptModal && !receiptModal.classList.contains('hidden')) updateReceiptTotal();
                        }
                    }
                });

                subscribeToBookings();
            } else {
                console.warn('Usuario no autenticado. Reintentando o redirigiendo...');
                if (unsubscribeBookings) {
                    unsubscribeBookings();
                    unsubscribeBookings = null;
                }
                updateCalendarEvents([]);
            }
        });
    }

    function subscribeToBookings() {
        if (typeof db === 'undefined') { updateCalendarEvents([]); return; }
        if (unsubscribeBookings) unsubscribeBookings();

        unsubscribeBookings = db.collection('bookings')
            .orderBy('entrada', 'asc')
            .onSnapshot(snapshot => {
                const events = [];
                allBookings = []; // Reset local state
                snapshot.forEach(doc => {
                    const data = doc.data();
                    allBookings.push({ id: doc.id, ...data });
                    const ev = bookingToEvent(doc.id, data);
                    if (ev) events.push(ev);
                });
                updateCalendarEvents(events);
            }, err => {
                console.error('Firestore:', err);
                if (err.code === 'permission-denied') {
                    showToast('Error de permisos: Inicia sesión de nuevo.');
                }
                updateCalendarEvents([]);
            });
    }

    function bookingToEvent(id, data) {
        const aptStr = data.apt || '';
        const aptKey = aptStr.toLowerCase().replace(/\s+/g, '_');
        const color  = aptColors[aptKey] || aptColors['default'];

        const startDate = data.entrada ? new Date(data.entrada) : null;
        const endDate   = data.salida  ? new Date(data.salida)  : null;
        if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;

        const calEnd = new Date(endDate);
        calEnd.setDate(calEnd.getDate() + 1);

        return {
            id: id,
            title: `${aptStr} (${data.pax || '?'} Pax)`,
            start: formatDateISO(startDate),
            end:   formatDateISO(calEnd),
            allDay: true,
            backgroundColor: color,
            borderColor:     color,
            extendedProps: {
                firestoreId: id,
                apt:         aptStr,
                salidaDate:  endDate.toISOString(),
                broker:      data.broker      || '',
                pax:         data.pax,
                bruto:       data.bruto,
                comisiones:  data.comisiones,
                neto:        data.neto,
                notas:       data.notas       || ''
            }
        };
    }

    async function saveBooking(formData) {
        if (typeof db === 'undefined') { alert('Firebase no inicializado.'); return; }

        const payload = {
            apt:        formData.apt,
            entrada:    formData.entrada,
            salida:     formData.salida,
            broker:     formData.broker     || '',
            pax:        parseInt(formData.pax)        || 0,
            bruto:      parseFloat(formData.bruto)    || 0,
            comisiones: parseFloat(formData.comisiones)|| 0,
            neto:       parseFloat(formData.neto)     || 0,
            notas:      formData.notas      || '',
            updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            if (currentEditingBookingId) {
                await db.collection('bookings').doc(currentEditingBookingId).update(payload);
                showToast('Reserva actualizada ✓');
            } else {
                payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('bookings').add(payload);
                showToast('Reserva añadida ✓');
            }
            closeBookingModal();
        } catch (err) {
            alert('Error al guardar: ' + err.message);
        }
    }

    async function deleteBooking(id) {
        if (!id) return;
        if (!confirm('¿Eliminar esta reserva? Esta acción no se puede deshacer.')) return;
        try {
            await db.collection('bookings').doc(id).delete();
            hideTooltip();
            showToast('Reserva eliminada');
        } catch (err) {
            alert('Error al eliminar: ' + err.message);
        }
    }

    // ── Calendar ──────────────────────────────────────────────────────────────

    function updateCalendarEvents(events) {
        if (!calendar) {
            calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                locale: 'es',
                headerToolbar: {
                    left:   'prev,next today',
                    center: 'title',
                    right:  'dayGridMonth,dayGridWeek'
                },
                buttonText: {
                    today: 'Hoy',
                    month: 'Mes',
                    week: 'Semana'
                },
                events: events,
                // Handle both Mouse and Touch
                eventMouseEnter: info => {
                    if (PAGE_MODE === 'tablet') return; // Prefer click on tablet
                    handleEventMouseEnter(info);
                    captureReceiptData(info);
                },
                eventMouseLeave: () => {
                    if (PAGE_MODE === 'tablet') return;
                    handleEventMouseLeave();
                },
                eventClick: info => {
                    if (PAGE_MODE === 'tablet') {
                        handleEventMouseEnter(info);
                        captureReceiptData(info);
                    }
                },
                displayEventTime: false,
                eventDisplay: 'block'
            });
            calendar.render();
        } else {
            calendar.removeAllEvents();
            calendar.addEventSource(events);
        }
    }

    function captureReceiptData(info) {
        receiptData = {
            apt:       info.event.extendedProps.apt,
            pax:       info.event.extendedProps.pax,
            startISO:  info.event.start ? info.event.start.toISOString() : '',
            salidaISO: info.event.extendedProps.salidaDate || ''
        };
    }

    // ── Tooltip ───────────────────────────────────────────────────────────────

    function handleEventMouseEnter(info) {
        const props = info.event.extendedProps;
        currentBookingId = props.firestoreId || info.event.id;

        if (ttApt) {
            ttApt.textContent = props.apt;
            const k = (props.apt||'').toLowerCase().replace(/\s+/g,'_');
            ttApt.style.backgroundColor = aptColors[k] || aptColors['default'];
        }

        const start   = info.event.start ? formatDateReadable(info.event.start) : '?';
        const realEnd = props.salidaDate  ? formatDateReadable(new Date(props.salidaDate)) : '?';
        if (ttDates)      ttDates.textContent = `${start} → ${realEnd}`;
        if (ttBroker)     ttBroker.textContent = props.broker || '-';
        if (ttPax)        ttPax.textContent    = props.pax    || '-';
        if (ttBruto)      ttBruto.textContent      = props.bruto      != null ? formatCurrency(props.bruto)      : '-';
        if (ttComisiones) ttComisiones.textContent = props.comisiones != null ? formatCurrency(props.comisiones) : '-';
        if (ttNeto)       ttNeto.textContent       = props.neto       != null ? formatCurrency(props.neto)       : '-';
        if (ttNotas)      ttNotas.textContent      = props.notas      || '-';

        const startStr = info.event.start ? formatDateISO(info.event.start) : '?';
        const endStr   = info.event.end   ? formatDateISO(info.event.end)   : '?';
        currentEventKey = `note_${props.apt}_${startStr}_${endStr}`;
        const savedNote = localStorage.getItem(currentEventKey) || '';

        if (ttLocalNote) {
            ttLocalNote.value = savedNote;
            if (ttSaveNote) { ttSaveNote.textContent = 'Guardar nota'; ttSaveNote.classList.remove('success'); }
        }
        if (ttLocalNoteDisplay) ttLocalNoteDisplay.textContent = savedNote || '-';

        tooltip.classList.remove('hidden');
        tooltip.style.left = `${info.jsEvent.pageX + 15}px`;
        tooltip.style.top  = `${info.jsEvent.pageY + 15}px`;
        requestAnimationFrame(() => tooltip.classList.add('show'));
    }

    function handleEventMouseLeave() {
        hideTooltipTimeout = setTimeout(() => {
            if (!isOverTooltip) {
                tooltip.classList.remove('show');
                setTimeout(() => { if (!isOverTooltip && !tooltip.classList.contains('show')) tooltip.classList.add('hidden'); }, 200);
            }
        }, 80);
    }

    function hideTooltip() {
        if (hideTooltipTimeout) clearTimeout(hideTooltipTimeout);
        tooltip.classList.remove('show');
        setTimeout(() => tooltip.classList.add('hidden'), 200);
    }

    if (tooltip) {
        tooltip.addEventListener('mouseenter', () => { isOverTooltip = true;  if (hideTooltipTimeout) clearTimeout(hideTooltipTimeout); });
        tooltip.addEventListener('mouseleave', () => {
            isOverTooltip = false;
            tooltip.classList.remove('show');
            setTimeout(() => { if (!tooltip.classList.contains('show')) tooltip.classList.add('hidden'); }, 200);
        });
    }

    // ── Booking form modal ────────────────────────────────────────────────────

    function openBookingModal(bookingId = null, data = null) {
        currentEditingBookingId = bookingId;
        if (bookingModalTitle) bookingModalTitle.textContent = bookingId ? 'Editar Reserva' : 'Nueva Reserva';
        if (bookingForm) bookingForm.reset();

        if (data && bookingId) {
            if (bfApt && data.apt) {
                // Case-insensitive match for the apartment selection
                const aptToMatch = data.apt.toLowerCase().trim();
                const option = Array.from(bfApt.options).find(opt => opt.value.toLowerCase().trim() === aptToMatch);
                if (option) bfApt.value = option.value;
            } else if (bfApt) {
                bfApt.value = '';
            }
            if (bfEntrada)    bfEntrada.value    = data.entrada    || '';
            if (bfSalida)     bfSalida.value     = data.salida     || '';
            if (bfBroker)     bfBroker.value     = data.broker     || '';
            if (bfPax)        bfPax.value        = data.pax        || 1;
            if (bfBruto)      bfBruto.value      = data.bruto      || '';
            if (bfComisiones) bfComisiones.value = data.comisiones || '';
            if (bfNeto)       bfNeto.value       = data.neto       || '';
            if (bfNotas)      bfNotas.value      = data.notas      || '';
        }

        if (bookingModal) { bookingModal.classList.remove('hidden'); if (bfApt) bfApt.focus(); }
    }

    function closeBookingModal() {
        if (bookingModal) bookingModal.classList.add('hidden');
        currentEditingBookingId = null;
        if (bookingForm) bookingForm.reset();
    }

    // Auto-calculate neto
    function calcNeto() {
        if (!bfBruto || !bfComisiones || !bfNeto) return;
        const b = parseFloat(bfBruto.value) || 0;
        const c = parseFloat(bfComisiones.value) || 0;
        bfNeto.value = (b - c).toFixed(2);
    }
    if (bfBruto)      bfBruto.addEventListener('input',      calcNeto);
    if (bfComisiones) bfComisiones.addEventListener('input', calcNeto);

    if (bookingForm) {
        bookingForm.addEventListener('submit', async e => {
            e.preventDefault();
            const fd = {
                apt:        bfApt        ? bfApt.value       : '',
                entrada:    bfEntrada    ? bfEntrada.value   : '',
                salida:     bfSalida     ? bfSalida.value    : '',
                broker:     bfBroker     ? bfBroker.value    : '',
                pax:        bfPax        ? bfPax.value       : 1,
                bruto:      bfBruto      ? bfBruto.value     : 0,
                comisiones: bfComisiones ? bfComisiones.value: 0,
                neto:       bfNeto       ? bfNeto.value      : 0,
                notas:      bfNotas      ? bfNotas.value     : ''
            };
            if (new Date(fd.salida) <= new Date(fd.entrada)) {
                alert('Check-out debe ser posterior al Check-in.');
                return;
            }
            await saveBooking(fd);
        });
    }

    document.getElementById('booking-modal-cancel-btn')?.addEventListener('click', closeBookingModal);
    if (bookingModal) bookingModal.addEventListener('click', e => { if (e.target === bookingModal) closeBookingModal(); });
    if (addBookingBtn) addBookingBtn.addEventListener('click', () => openBookingModal());

    if (ttEditBtn) {
        ttEditBtn.addEventListener('click', async () => {
            hideTooltip();
            if (!currentBookingId) return;
            try {
                const doc = await db.collection('bookings').doc(currentBookingId).get();
                if (doc.exists) openBookingModal(doc.id, doc.data());
            } catch (err) { alert('Error: ' + err.message); }
        });
    }

    if (ttDeleteBtn) {
        ttDeleteBtn.addEventListener('click', () => deleteBooking(currentBookingId));
    }

    // ── ODS / file import ─────────────────────────────────────────────────────

    if (dropZone) {
        dropZone.addEventListener('click',    ()  => fileInput && fileInput.click());
        dropZone.addEventListener('dragover',  e  => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', e  => { e.preventDefault(); dropZone.classList.remove('drag-over'); });
        dropZone.addEventListener('drop',      e  => {
            e.preventDefault(); dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
        });
    }
    if (fileInput) fileInput.addEventListener('change', e => { if (e.target.files.length > 0) handleFile(e.target.files[0]); });

    function handleFile(file) {
        if (!file.name.match(/\.(ods|xlsx|xls)$/i)) { alert('Sube un fichero .ods, .xlsx o .xls'); return; }
        const reader = new FileReader();
        reader.onload = e => {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array', cellDates:true, cellNF:false, cellText:false });
            if (IS_ADMIN && typeof db !== 'undefined') {
                importWorkbookToFirestore(wb, file.name);
            } else {
                processWorkbookLocal(wb);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    async function importWorkbookToFirestore(workbook, fileName) {
        const toImport = [];
        workbook.SheetNames.forEach(sheetName => {
            XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]).forEach(row => {
                const r = {};
                for (let k in row) r[k.trim().toLowerCase()] = row[k];
                const s = parseExcelDate(r['entrada']), e = parseExcelDate(r['salida']);
                if (s && e) {
                    toImport.push({
                        apt:        sheetName,
                        entrada:    formatDateISO(s),
                        salida:     formatDateISO(e),
                        broker:     findCol(r, ['broker','canal','plataforma','agencia','cliente']) || '',
                        pax:        parseInt(r['pax'])         || 0,
                        bruto:      parseFloat(r['bruto'])     || 0,
                        comisiones: parseFloat(r['comisiones'])|| 0,
                        neto:       parseFloat(r['neto'])      || 0,
                        notas:      r['notas'] || r['notes']   || ''
                    });
                }
            });
        });
        if (!toImport.length) { alert('No se encontraron reservas válidas.'); return; }
        if (!confirm(`Se encontraron ${toImport.length} reservas en "${fileName}".\n¿Añadirlas a la base de datos?\n(Las reservas existentes NO se borrarán.)`)) return;

        try {
            const CHUNK = 499;
            for (let i = 0; i < toImport.length; i += CHUNK) {
                const batch = db.batch();
                toImport.slice(i, i + CHUNK).forEach(b => {
                    batch.set(db.collection('bookings').doc(), {
                        ...b,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                await batch.commit();
            }
            showToast(`✅ ${toImport.length} reservas importadas`);
            const sp = dropZone?.querySelector('span');
            if (sp) sp.textContent = `Importado: ${fileName} (${toImport.length})`;
        } catch (err) { alert('Error al importar: ' + err.message); }
    }

    function processWorkbookLocal(workbook) {
        const evs = [];
        workbook.SheetNames.forEach(sheetName => {
            const color = aptColors[sheetName.toLowerCase().replace(/\s+/g,'_')] || aptColors['default'];
            XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]).forEach(row => {
                const r = {}; for (let k in row) r[k.trim().toLowerCase()] = row[k];
                const s = parseExcelDate(r['entrada']), e = parseExcelDate(r['salida']);
                if (s && e) {
                    const ce = new Date(e); ce.setDate(ce.getDate()+1);
                    evs.push({ title:`${sheetName} (${r['pax']||'?'} Pax)`, start:formatDateISO(s), end:formatDateISO(ce), allDay:true, backgroundColor:color,
                        extendedProps:{ apt:sheetName, salidaDate:e.toISOString(), broker:findCol(r,['broker','canal','plataforma','agencia','cliente']),
                            pax:r['pax'], bruto:r['bruto'], comisiones:r['comisiones'], neto:r['neto'], notas:r['notas']||r['notes'] }});
                }
            });
        });
        updateCalendarEvents(evs);
    }

    // ── Local Notes ───────────────────────────────────────────────────────────

    if (ttSaveNote && ttLocalNote) {
        ttSaveNote.addEventListener('click', () => {
            if (currentEventKey) {
                localStorage.setItem(currentEventKey, ttLocalNote.value);
                ttSaveNote.textContent = '¡Guardado!'; ttSaveNote.classList.add('success');
            }
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const notes = {};
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k?.startsWith('note_')) notes[k] = localStorage.getItem(k);
            }
            if (!Object.keys(notes).length) { alert('No hay notas guardadas.'); return; }
            const a = Object.assign(document.createElement('a'), {
                href: 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(notes)),
                download: 'calendar_notes.json'
            });
            document.body.appendChild(a); a.click(); a.remove();
        });
    }

    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => importFile.click());
        importFile.addEventListener('change', e => {
            if (!e.target.files.length) return;
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    const notes = JSON.parse(ev.target.result); let count = 0;
                    for (let k in notes) { if (k.startsWith('note_')) { localStorage.setItem(k, notes[k]); count++; } }
                    alert(`Se importaron ${count} notas.`);
                } catch { alert('Error al leer el archivo.'); }
                e.target.value = '';
            };
            reader.readAsText(e.target.files[0]);
        });
    }

    // ── Receipt logic ─────────────────────────────────────────────────────────

    const receiptI18n = {
        es: { title:'Recibo Tasa Turística', apt:'Apartamento:', checkin:'Check-in:', checkout:'Check-out:', pax:'Nº de personas (>16 años):', nights:'Noches (máx. 7):', rate:'Tarifa por persona/noche:', total:'TOTAL:', footer:'Gracias por su visita.', btnPrint:'Imprimir', btnClose:'Cerrar', maxSuffix:' (máx.)', locale:'es-ES' },
        en: { title:'Touristic Tax Receipt', apt:'Apartment:', checkin:'Check-in:', checkout:'Check-out:', pax:'Number of persons (>16 years):', nights:'Nights (max. 7):', rate:'Rate per person/night:', total:'TOTAL:', footer:'Thank you for your stay.', btnPrint:'Print', btnClose:'Close', maxSuffix:' (max.)', locale:'en-GB' }
    };

    function formatReceiptDate(isoStr) {
        if (!isoStr) return '-';
        return new Date(isoStr).toLocaleDateString(receiptI18n[currentReceiptLang].locale, { day:'2-digit', month:'2-digit', year:'numeric' });
    }

    function updateReceiptTotal() {
        const pax   = parseInt(document.getElementById('r-pax')?.value, 10) || 0;
        const total = pax * currentNights * RATE_PER_PERSON_NIGHT;
        const loc   = receiptI18n[currentReceiptLang].locale;
        const el    = document.getElementById('r-total');
        if (el) el.textContent = total.toLocaleString(loc, { style:'currency', currency:'EUR' });
    }

    function applyReceiptTranslations() {
        const t = receiptI18n[currentReceiptLang];
        const idToKey = {
            'r-title-txt':  'title',
            'r-lbl-apt':    'apt',
            'r-lbl-checkin':'checkin',
            'r-lbl-checkout':'checkout',
            'r-lbl-pax':    'pax',
            'r-lbl-nights': 'nights',
            'r-lbl-rate':   'rate',
            'r-lbl-total':  'total',
            'r-footer-txt': 'footer',
            'r-btn-print':  'btnPrint',
            'r-btn-close':  'btnClose'
        };
        Object.entries(idToKey).forEach(([id, key]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = t[key];
        });
        if (receiptModal && !receiptModal.classList.contains('hidden') && receiptActiveData.startISO) {
            document.getElementById('r-checkin').textContent  = formatReceiptDate(receiptActiveData.startISO);
            document.getElementById('r-checkout').textContent = formatReceiptDate(receiptActiveData.salidaISO);
            document.getElementById('r-nights').textContent   = currentNights + (currentNights === MAX_NIGHTS ? t.maxSuffix : '');
            updateReceiptTotal();
        }
    }

    async function getNextReceiptId() {
        const year = new Date().getFullYear();
        const configRef = db.collection('settings').doc('global_config');
        
        try {
            return await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(configRef);
                let counters = {};
                if (doc.exists) counters = doc.data().counters || {};
                
                const current = parseInt(counters[year] || '0', 10);
                const next = current + 1;
                
                // Update Firestore
                counters[year] = next;
                transaction.update(configRef, { counters: counters });
                
                return `${year}-${String(next).padStart(3,'0')}`;
            });
        } catch (e) {
            console.error('Error incrementing counter:', e);
            // Fallback to local if truly desperate
            const key = `receipt_counter_${year}`;
            const n = parseInt(localStorage.getItem(key) || '0', 10) + 1;
            localStorage.setItem(key, n);
            return `${year}-${String(n).padStart(3,'0')}`;
        }
    }

    function calcNightsR(startISO, salidaISO) {
        const raw = Math.max(0, Math.round((new Date(salidaISO) - new Date(startISO)) / 86400000));
        return Math.min(raw, MAX_NIGHTS);
    }

    async function openReceipt(aptName, paxCount, startISO, salidaISO) {
        receiptActiveData = { apt:aptName, startISO, salidaISO };
        const pax = parseInt(paxCount, 10) || 0;
        currentNights = calcNightsR(startISO, salidaISO);
        const t  = receiptI18n[currentReceiptLang];
        const id = await getNextReceiptId();
        document.getElementById('r-id').textContent       = id;
        document.getElementById('r-apt').textContent      = aptName || '-';
        document.getElementById('r-checkin').textContent  = formatReceiptDate(startISO);
        document.getElementById('r-checkout').textContent = formatReceiptDate(salidaISO);
        const rateTxt = document.getElementById('r-rate-txt');
        if (rateTxt) rateTxt.textContent = RATE_PER_PERSON_NIGHT.toLocaleString(t.locale, { style:'currency', currency:'EUR' });
        const paxEl = document.getElementById('r-pax');
        if (paxEl) paxEl.value = pax;
        document.getElementById('r-nights').textContent = currentNights + (currentNights === MAX_NIGHTS ? t.maxSuffix : '');
        updateReceiptTotal();
        if (receiptModal) receiptModal.classList.remove('hidden');
    }

    document.getElementById('r-pax')?.addEventListener('input', updateReceiptTotal);
    document.getElementById('receipt-lang-select')?.addEventListener('change', e => { currentReceiptLang = e.target.value; applyReceiptTranslations(); });

    if (ttPrintReceipt) {
        ttPrintReceipt.addEventListener('click', () => {
            hideTooltip();
            openReceipt(receiptData.apt, receiptData.pax, receiptData.startISO, receiptData.salidaISO);
        });
    }
    if (receiptCloseBtn) receiptCloseBtn.addEventListener('click', () => receiptModal.classList.add('hidden'));
    if (receiptModal)    receiptModal.addEventListener('click',    e => { if (e.target === receiptModal) receiptModal.classList.add('hidden'); });

    if (receiptPrintBtn) {
        receiptPrintBtn.addEventListener('click', async () => {
            const pax   = parseInt(document.getElementById('r-pax')?.value, 10) || 0;
            const total = pax * currentNights * RATE_PER_PERSON_NIGHT;
            const id    = document.getElementById('r-id').textContent;

            // Save to Firestore instead of localStorage
            try {
                await db.collection('receipts').add({
                    id: id,
                    apt: receiptActiveData.apt || '-',
                    checkin: receiptActiveData.startISO,
                    pax: pax,
                    nights: currentNights,
                    total: total,
                    dateEmitted: new Date().toISOString()
                });
                window.print();
            } catch (e) {
                alert('Error al guardar recibo: ' + e.message);
            }
        });
    }

    async function openRegistry() {
        if (!registryTbody) return;
        registryTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Cargando...</td></tr>';
        registryModal?.classList.remove('hidden');

        try {
            const snapshot = await db.collection('receipts').orderBy('dateEmitted', 'desc').limit(100).get();
            registryTbody.innerHTML = '';
            
            if (snapshot.empty) {
                registryTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">No hay recibos emitidos.</td></tr>';
                return;
            }

            snapshot.forEach(doc => {
                const r = doc.data();
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #f2f4f7';
                tr.innerHTML = `
                    <td style="padding:12px 10px;">${r.id}</td>
                    <td style="padding:12px 10px;">${formatReceiptDate(r.checkin)}</td>
                    <td style="padding:12px 10px;">${r.apt}</td>
                    <td style="padding:12px 10px; text-align:center;">${r.pax}</td>
                    <td style="padding:12px 10px; text-align:center;">${r.nights}</td>
                    <td style="padding:12px 10px; text-align:right; font-weight:600;">${formatCurrency(r.total)}</td>
                `;
                registryTbody.appendChild(tr);
            });
        } catch (e) {
            registryTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;padding:20px;">Error: ${e.message}</td></tr>`;
        }
    }

    if (registryBtn) registryBtn.addEventListener('click', openRegistry);
    if (registryCloseBtn) registryCloseBtn.addEventListener('click', () => registryModal?.classList.add('hidden'));
    if (registryModal) registryModal.addEventListener('click', e => { if (e.target === registryModal) registryModal.classList.add('hidden'); });

    // ── Registry ──────────────────────────────────────────────────────────────

    function openRegistry() {
        if (!registryModal) return;
        const yr   = new Date().getFullYear();
        const all  = JSON.parse(localStorage.getItem('emitted_receipts') || '[]');
        currentFilteredReceipts = all.filter(r => new Date(r.checkin || r.dateEmitted).getFullYear() === yr)
                                     .sort((a,b) => new Date(b.dateEmitted) - new Date(a.dateEmitted));
        let p1T=0, p1C=0, p2T=0, p2C=0;
        registryTbody.innerHTML = '';
        currentFilteredReceipts.forEach(r => {
            const m = new Date(r.checkin || r.dateEmitted).getMonth();
            if (m >= 3 && m <= 9) { p1T += r.total; p1C++; } else { p2T += r.total; p2C++; }
            const tr = document.createElement('tr');
            tr.innerHTML = `<td style="padding:10px;border-bottom:1px solid #e0e0e0">${r.id}</td><td style="padding:10px;border-bottom:1px solid #e0e0e0">${formatReceiptDate(r.checkin)}</td><td style="padding:10px;border-bottom:1px solid #e0e0e0">${r.apt}</td><td style="padding:10px;border-bottom:1px solid #e0e0e0">${r.pax}</td><td style="padding:10px;border-bottom:1px solid #e0e0e0">${r.nights}</td><td style="padding:10px;border-bottom:1px solid #e0e0e0;font-weight:600">${r.total.toLocaleString('es-ES',{style:'currency',currency:'EUR'})}</td>`;
            registryTbody.appendChild(tr);
        });
        document.getElementById('reg-total-p1').textContent = p1T.toLocaleString('es-ES',{style:'currency',currency:'EUR'});
        document.getElementById('reg-count-p1').textContent = `${p1C} recibos`;
        document.getElementById('reg-total-p2').textContent = p2T.toLocaleString('es-ES',{style:'currency',currency:'EUR'});
        document.getElementById('reg-count-p2').textContent = `${p2C} recibos`;
        registryModal.classList.remove('hidden');
    }

    if (registryBtn)      registryBtn.addEventListener('click',      openRegistry);
    if (registryCloseBtn) registryCloseBtn.addEventListener('click', () => registryModal.classList.add('hidden'));
    if (registryModal)    registryModal.addEventListener('click',    e => { if (e.target === registryModal) registryModal.classList.add('hidden'); });

    if (registryExportBtn) {
        registryExportBtn.addEventListener('click', () => {
            if (!currentFilteredReceipts.length) { alert('No hay recibos para exportar.'); return; }
            let csv = 'ID,Fecha Check-in,Alojamiento,Pax,Noches,Total(EUR),Fecha Emision\n';
            currentFilteredReceipts.forEach(r => {
                csv += `"${r.id}","${formatReceiptDate(r.checkin)}","${r.apt}","${r.pax}","${r.nights}","${r.total.toFixed(2)}","${new Date(r.dateEmitted).toLocaleString('es-ES')}"\n`;
            });
            const a = Object.assign(document.createElement('a'), {
                href: URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8;' })),
                download: `recibos_${new Date().getFullYear()}.csv`
            });
            a.click(); URL.revokeObjectURL(a.href);
        });
    }

    // ── Configuration ─────────────────────────────────────────────────────────

    if (configBtn) configBtn.addEventListener('click', () => {
        if (configTaxRateInput) configTaxRateInput.value = RATE_PER_PERSON_NIGHT;
        if (configModal) configModal.classList.remove('hidden');
    });
    if (configCloseBtn) configCloseBtn.addEventListener('click', () => configModal?.classList.add('hidden'));
    if (configSaveBtn)  configSaveBtn.addEventListener('click',  async () => {
        const newRate = parseFloat(configTaxRateInput.value) || 1.75;
        await updateGlobalConfig({ tax_rate: newRate });
        // UI updates automatically via onSnapshot
        configModal?.classList.add('hidden');
    });
    if (configResetBtn) configResetBtn.addEventListener('click', async () => {
        const yr = new Date().getFullYear();
        if (confirm(`¿Reiniciar contador de recibos para ${yr} en la base de datos?`)) {
            const config = await getGlobalConfig();
            config.counters[yr] = 0;
            await updateGlobalConfig({ counters: config.counters });
            configModal?.classList.add('hidden');
        }
    });
    if (configModal) configModal.addEventListener('click', e => { if (e.target === configModal) configModal.classList.add('hidden'); });

    // ── Utilities ─────────────────────────────────────────────────────────────

    function formatDateReadable(date) {
        return date.toLocaleDateString('es-ES', { day:'numeric', month:'short' });
    }
    function formatCurrency(val) {
        if (isNaN(val)) return val;
        return Number(val).toLocaleString('es-ES', { style:'currency', currency:'EUR' });
    }
    function formatDateISO(date) {
        return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    }
    function findCol(row, keywords) {
        for (const kw of keywords) {
            if (row[kw] != null && row[kw] !== '') return row[kw];
            const mk = Object.keys(row).find(k => k.includes(kw));
            if (mk && row[mk] != null && row[mk] !== '') return row[mk];
        }
        return undefined;
    }
    function parseExcelDate(val) {
        if (val instanceof Date) return val;
        if (typeof val === 'number') return new Date((val - 25569) * 86400 * 1000);
        if (typeof val === 'string') {
            const str = val.toLowerCase().trim();
            const d   = new Date(str);
            if (!isNaN(d.getTime()) && str.length > 5 && !str.match(/^\d+$/)) return d;
            if (str.match(/^\d{5}$/)) return new Date((parseInt(str)-25569)*86400*1000);
            const mm  = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };
            const pts = str.replace(/[-.]/g,'/').replace(/\s+/g,'/').split('/');
            if (pts.length >= 2) {
                const dd  = parseInt(pts[0],10);
                const mStr= pts[1].replace(/[^a-z0-9]/g,'');
                const mo  = isNaN(parseInt(mStr,10)) ? mm[mStr.substring(0,3)] : parseInt(mStr,10)-1;
                let   yr  = new Date().getFullYear();
                if (pts[2]) { let ys=pts[2].replace(/\D/g,''); if(ys){ yr=parseInt(ys,10); if(yr<100) yr+=2000; } }
                if (!isNaN(dd) && mo !== undefined && !isNaN(mo) && !isNaN(yr)) return new Date(yr,mo,dd);
            }
        }
        return null;
    }

    function showToast(msg) {
        let t = document.getElementById('app-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'app-toast';
            t.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#23262f;color:#fff;padding:12px 24px;border-radius:999px;font-size:.9rem;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,.5);z-index:999999;transition:opacity .3s;pointer-events:none;border:1px solid #444;';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.style.opacity = '1';
        clearTimeout(t._to);
        t._to = setTimeout(() => { t.style.opacity = '0'; }, 2500);
    }

    // ============================
    // REPORTS LOGIC
    // ============================

    function initReports() {
        if (!reportsBtn) return;

        // Populate Month/Year selectors
        const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        months.forEach((m, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = m;
            reportsMonthSel.appendChild(opt);
        });

        const currentYear = new Date().getFullYear();
        for (let y = currentYear - 2; y <= currentYear + 2; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            reportsYearSel.appendChild(opt);
        }

        // Set current month/year defaults
        reportsMonthSel.value = new Date().getMonth();
        reportsYearSel.value = currentYear;

        reportsBtn.addEventListener('click', () => {
            generateReport();
            reportsModal.classList.remove('hidden');
        });

        reportsCloseBtn.addEventListener('click', () => reportsModal.classList.add('hidden'));
        [reportsMonthSel, reportsYearSel].forEach(s => s.addEventListener('change', generateReport));
    }

    function generateReport() {
        const targetMonth = parseInt(reportsMonthSel.value);
        const targetYear = parseInt(reportsYearSel.value);

        const stats = {}; // Monthly stats
        const yearlyStats = {}; // Annual stats
        const yearlyBrokerStats = {}; // Annual broker stats

        allBookings.forEach(b => {
            const start = new Date(b.entrada);
            const end = new Date(b.salida);
            if (isNaN(start) || isNaN(end)) return;

            const totalNights = Math.round((end - start) / (1000 * 60 * 60 * 24));
            if (totalNights <= 0) return;

            // 1. Monthly Calculation (Split Logic)
            const nightsInMonth = calculateNightsInMonth(start, end, targetMonth, targetYear);
            if (nightsInMonth > 0) {
                const ratio = nightsInMonth / totalNights;
                const apt = b.apt || 'Otro';
                if (!stats[apt]) stats[apt] = { bruto: 0, neto: 0, comisiones: 0, nights: 0 };
                stats[apt].bruto += (parseFloat(b.bruto) || 0) * ratio;
                stats[apt].neto += (parseFloat(b.neto) || 0) * ratio;
                stats[apt].comisiones += (parseFloat(b.comisiones) || 0) * ratio;
                stats[apt].nights += nightsInMonth;
            }

            // 2. Annual Calculation (Simple check if booking belongs to year)
            // We count the nights that fall within the target year
            const nightsInYear = calculateNightsInYear(start, end, targetYear);
            if (nightsInYear > 0) {
                const ratioY = nightsInYear / totalNights;
                
                const aptY = b.apt || 'Otro';
                if (!yearlyStats[aptY]) yearlyStats[aptY] = { bruto: 0, neto: 0, nights: 0 };
                yearlyStats[aptY].bruto += (parseFloat(b.bruto) || 0) * ratioY;
                yearlyStats[aptY].neto += (parseFloat(b.neto) || 0) * ratioY;
                yearlyStats[aptY].nights += nightsInYear;
                
                let rawBroker = (b.broker || 'Directo').trim();
                let brokerY = rawBroker;
                if (rawBroker.toLowerCase() === 'airbnb') brokerY = 'Airbnb';
                else if (rawBroker.toLowerCase() === 'booking') brokerY = 'Booking';
                else if (rawBroker === '') brokerY = 'Directo';
                
                if (!yearlyBrokerStats[brokerY]) yearlyBrokerStats[brokerY] = { bruto: 0, neto: 0, nights: 0 };
                yearlyBrokerStats[brokerY].bruto += (parseFloat(b.bruto) || 0) * ratioY;
                yearlyBrokerStats[brokerY].neto += (parseFloat(b.neto) || 0) * ratioY;
                yearlyBrokerStats[brokerY].nights += nightsInYear;
            }
        });

        renderReportTable(stats);
        renderAnnualTable(yearlyStats, targetYear);
        renderBrokerTable(yearlyBrokerStats, targetYear);
    }

    function calculateNightsInYear(start, end, year) {
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year + 1, 0, 1); // Start of next year
        const overlapStart = new Date(Math.max(start, yearStart));
        const overlapEnd = new Date(Math.min(end, yearEnd));
        if (overlapStart < overlapEnd) {
            return Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24));
        }
        return 0;
    }

    function renderAnnualTable(yearlyStats, year) {
        if (reportsAnnualTitle) reportsAnnualTitle.textContent = `📊 Acumulado Anual ${year}`;
        if (!reportsAnnualBody) return;

        reportsAnnualBody.innerHTML = '';
        Object.entries(yearlyStats).forEach(([name, data]) => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #f2f4f7';
            tr.innerHTML = `
                <td style="padding:12px 10px; font-weight:400; color:#101828;">${name}</td>
                <td style="padding:12px 10px; text-align:right; font-weight:400; color:#475467;">${formatCurrency(data.bruto)}</td>
                <td style="padding:12px 10px; text-align:right; font-weight:400; color:#1570ef;">${formatCurrency(data.neto)}</td>
                <td style="padding:12px 10px; text-align:right; font-weight:400; color:#475467;">${data.nights}</td>
            `;
            reportsAnnualBody.appendChild(tr);
        });
    }

    function renderBrokerTable(yearlyBrokerStats, year) {
        if (reportsBrokerTitle) reportsBrokerTitle.textContent = `📊 Acumulado Anual por Canal ${year}`;
        if (!reportsBrokerBody) return;

        reportsBrokerBody.innerHTML = '';
        Object.entries(yearlyBrokerStats).forEach(([name, data]) => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #f2f4f7';
            tr.innerHTML = `
                <td style="padding:12px 10px; font-weight:400; color:#101828;">${name}</td>
                <td style="padding:12px 10px; text-align:right; font-weight:400; color:#475467;">${formatCurrency(data.bruto)}</td>
                <td style="padding:12px 10px; text-align:right; font-weight:400; color:#1570ef;">${formatCurrency(data.neto)}</td>
                <td style="padding:12px 10px; text-align:right; font-weight:400; color:#475467;">${data.nights}</td>
            `;
            reportsBrokerBody.appendChild(tr);
        });
    }

    function calculateNightsInMonth(start, end, month, year) {
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 1);

        // Effective start/end within the targeted month
        const overlapStart = new Date(Math.max(start, monthStart));
        const overlapEnd = new Date(Math.min(end, monthEnd));

        if (overlapStart < overlapEnd) {
            return Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24));
        }
        return 0;
    }

    function renderReportTable(stats) {
        reportsTableBody.innerHTML = '';
        let totalB = 0, totalN = 0, totalC = 0, totalD = 0;

        Object.entries(stats).forEach(([name, data]) => {
            totalB += data.bruto;
            totalN += data.neto;
            totalC += data.comisiones;
            totalD += data.nights;

            const comPerc = data.bruto > 0 ? (data.comisiones / data.bruto * 100).toFixed(1) : '0.0';

            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #f2f4f7';
            tr.innerHTML = `
                <td style="padding:14px 10px; font-weight:400; color:#101828;">${name}</td>
                <td style="padding:14px 10px; text-align:right; font-weight:400; color:#344054;">${formatCurrency(data.bruto)}</td>
                <td style="padding:14px 10px; text-align:right; font-weight:400; color:#101828;">${formatCurrency(data.neto)}</td>
                <td style="padding:14px 10px; text-align:right; color:#d92d20; font-weight:400;">${formatCurrency(data.comisiones)}</td>
                <td style="padding:14px 10px; text-align:right; font-size:0.85rem; color:#667085; font-weight:400;">${comPerc}%</td>
                <td style="padding:14px 10px; text-align:center; font-weight:400; color:#344054;">${data.nights}</td>
            `;
            reportsTableBody.appendChild(tr);
        });

        const totalComPerc = totalB > 0 ? (totalC / totalB * 100).toFixed(1) : '0.0';
        reportsTableFoot.innerHTML = `
            <tr style="background:#f9fafb;">
                <td style="padding:14px 10px; font-weight:800; color:#1570ef;">TOTAL MES</td>
                <td style="padding:14px 10px; text-align:right; font-weight:800; color:#101828;">${formatCurrency(totalB)}</td>
                <td style="padding:14px 10px; text-align:right; font-weight:800; color:#1570ef;">${formatCurrency(totalN)}</td>
                <td style="padding:14px 10px; text-align:right; font-weight:700; color:#d92d20;">${formatCurrency(totalC)}</td>
                <td style="padding:14px 10px; text-align:right; font-size:0.85rem; color:#667085; font-weight:500;">${totalComPerc}%</td>
                <td style="padding:14px 10px; text-align:center; font-weight:800; color:#101828;">${totalD}</td>
            </tr>
        `;
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    initFirebaseSync();
    initReports();
});
