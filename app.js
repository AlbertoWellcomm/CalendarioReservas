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
    let RATE_PER_PERSON_NIGHT  = parseFloat(localStorage.getItem('touristic_tax_rate')) || 1.75;
    const MAX_NIGHTS           = 7;
    let currentNights          = 0;
    let currentReceiptLang     = 'es';
    let receiptActiveData      = { apt:'', startISO:'', salidaISO:'' };
    let currentFilteredReceipts= [];

    // ── Firebase helpers ──────────────────────────────────────────────────────

    function initFirebaseSync() {
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                console.log('Autenticado como:', user.email);
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
                snapshot.forEach(doc => {
                    const ev = bookingToEvent(doc.id, doc.data());
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
            if (bfApt)        bfApt.value        = data.apt        || '';
            if (bfEntrada)    bfEntrada.value    = data.entrada    || '';
            if (bfSalida)     bfSalida.value     = data.salida     || '';
            if (bfBroker)     bfBroker.value     = data.broker     || '';
            if (bfPax)        bfPax.value        = data.pax        || 1;
            if (bfBruto)      bfBruto.value      = data.bruto      || '';
            if (bfComisiones) bfComisiones.value = data.comisiones || '';
            if (bfNeto)       bfNeto.value       = data.neto       || '';
            if (bfNotas)      bfNotas.value      = data.notas      || '';
        }

        if (bookingModal) { bookingModal.classList.remove('hidden'); if (bfEntrada) bfEntrada.focus(); }
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

    function getNextReceiptId() {
        const year = new Date().getFullYear(), key = `receipt_counter_${year}`;
        const n = parseInt(localStorage.getItem(key) || '0', 10) + 1;
        localStorage.setItem(key, n);
        return `${year}-${String(n).padStart(3,'0')}`;
    }

    function calcNightsR(startISO, salidaISO) {
        const raw = Math.max(0, Math.round((new Date(salidaISO) - new Date(startISO)) / 86400000));
        return Math.min(raw, MAX_NIGHTS);
    }

    function openReceipt(aptName, paxCount, startISO, salidaISO) {
        receiptActiveData = { apt:aptName, startISO, salidaISO };
        const pax = parseInt(paxCount, 10) || 0;
        currentNights = calcNightsR(startISO, salidaISO);
        const t  = receiptI18n[currentReceiptLang];
        const id = getNextReceiptId();
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
        receiptPrintBtn.addEventListener('click', () => {
            const pax   = parseInt(document.getElementById('r-pax')?.value, 10) || 0;
            const total = pax * currentNights * RATE_PER_PERSON_NIGHT;
            const hist  = JSON.parse(localStorage.getItem('emitted_receipts') || '[]');
            hist.push({ id: document.getElementById('r-id').textContent, apt: receiptActiveData.apt||'-', checkin: receiptActiveData.startISO, pax, nights: currentNights, total, dateEmitted: new Date().toISOString() });
            localStorage.setItem('emitted_receipts', JSON.stringify(hist));
            window.print();
        });
    }

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
    if (configSaveBtn)  configSaveBtn.addEventListener('click',  () => {
        RATE_PER_PERSON_NIGHT = parseFloat(configTaxRateInput.value) || 1.75;
        localStorage.setItem('touristic_tax_rate', RATE_PER_PERSON_NIGHT);
        if (receiptModal && !receiptModal.classList.contains('hidden')) { updateReceiptTotal(); }
        configModal?.classList.add('hidden');
    });
    if (configResetBtn) configResetBtn.addEventListener('click', () => {
        const yr = new Date().getFullYear();
        if (confirm(`¿Reiniciar contador de recibos para ${yr}?`)) {
            localStorage.setItem(`receipt_counter_${yr}`, '0');
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

    // ── Init ──────────────────────────────────────────────────────────────────
    initFirebaseSync();
});
