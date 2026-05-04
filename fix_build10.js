const fs = require('fs');
const path = require('path');
const os = require('os');

const filePath = path.join(os.homedir(), 'Downloads', 'holiday-tracker', 'src', 'App.jsx');
if (!fs.existsSync(filePath)) { console.error('Cannot find App.jsx at:', filePath); process.exit(1); }

let code = fs.readFileSync(filePath, 'utf8');
fs.writeFileSync(filePath + '.build9.bak', code);

const notesAnchor = code.indexOf('<TextArea k="notes"');
if (notesAnchor === -1) { console.error('Cannot find notes TextArea anchor'); process.exit(1); }

const inject = `
        {(label.toLowerCase().includes("activit") || (label.toLowerCase().includes("tour") && !label.toLowerCase().includes("tour package"))) && (<>
          <Field k="activityName" label="Activity / Tour Name" placeholder="e.g. Boat Trip to Blue Lagoon" form={form} set={set} />
          <Field k="activityLocation" label="Location" placeholder="e.g. Reykjavik Marina" form={form} set={set} />
          <HalfDateField k="activityDate" label="Date" form={form} set={set} />
          <div style={{ display:"flex", gap:"12px" }}>
            <HalfTimeField k="startTime" label="Start Time" form={form} set={set} />
            <HalfTimeField k="endTime" label="End Time" form={form} set={set} />
          </div>
        </>)}
        {label.toLowerCase().includes("currenc") && (
          <HalfDateField k="pickupDate" label="Collection / Pickup Date" form={form} set={set} />
        )}
        {(label.toLowerCase().includes("ferry") || label.toLowerCase().includes("cruise")) && (<>
          <HalfField k="departurePort" label="Departure Port" placeholder="e.g. Dover" form={form} set={set} />
          <HalfField k="arrivalPort" label="Arrival Port" placeholder="e.g. Calais" form={form} set={set} />
        </>)}
        {label.toLowerCase().includes("sail") && (<>
          <HalfField k="departurePort" label="Departure Marina / Port" placeholder="e.g. Palma Marina" form={form} set={set} />
          <HalfField k="arrivalPort" label="Return Marina / Port" placeholder="e.g. Palma Marina" form={form} set={set} />
        </>)}
        {label.toLowerCase().includes("theme park") && (<>
          <Field k="parkName" label="Theme Park Name" placeholder="e.g. Disneyland Paris" form={form} set={set} />
          <HalfDateField k="entryDate" label="Entry Date" form={form} set={set} />
          <HalfDateField k="exitDate" label="Exit Date (if multi-day)" form={form} set={set} />
        </>)}
        {label.toLowerCase().includes("restaurant") && (<>
          <Field k="restaurantName" label="Restaurant Name" placeholder="e.g. La Pergola" form={form} set={set} />
          <Field k="restaurantAddress" label="Address" placeholder="e.g. Via Alberto Cadlolo 101, Rome" form={form} set={set} />
          <HalfDateField k="bookingDate" label="Booking Date" form={form} set={set} />
          <HalfTimeField k="bookingTime" label="Booking Time" form={form} set={set} />
          <HalfField k="diners" label="Number of Diners" placeholder="e.g. 4" form={form} set={set} />
        </>)}
        {label.toLowerCase().includes("tour package") && (<>
          <HalfField k="departurePoint" label="Departure Point" placeholder="e.g. Manchester Airport" form={form} set={set} />
          <HalfField k="dropOffPoint" label="Drop-off Point" placeholder="e.g. Heathrow Terminal 5" form={form} set={set} />
          <HalfDateField k="departureDate" label="Departure Date" form={form} set={set} />
          <HalfField k="duration" label="Duration" placeholder="e.g. 10 nights" form={form} set={set} />
        </>)}
        {label.toLowerCase().includes("vaccin") && (<>
          <Field k="vaccineName" label="Vaccine Name" placeholder="e.g. Hepatitis A, Yellow Fever" form={form} set={set} />
          <HalfDateField k="vaccinationDate" label="Vaccination Date" form={form} set={set} />
        </>)}
`;

code = code.slice(0, notesAnchor) + inject + code.slice(notesAnchor);

// Add new fields to form state
const newStateFields = `
    activityName: booking?.activityName || "",
    activityLocation: booking?.activityLocation || "",
    activityDate: booking?.activityDate || "",
    startTime: booking?.startTime || "",
    endTime: booking?.endTime || "",
    pickupDate: booking?.pickupDate || "",
    departurePort: booking?.departurePort || "",
    arrivalPort: booking?.arrivalPort || "",
    parkName: booking?.parkName || "",
    entryDate: booking?.entryDate || "",
    exitDate: booking?.exitDate || "",
    restaurantName: booking?.restaurantName || "",
    restaurantAddress: booking?.restaurantAddress || "",
    bookingDate: booking?.bookingDate || "",
    bookingTime: booking?.bookingTime || "",
    diners: booking?.diners || "",
    departurePoint: booking?.departurePoint || "",
    dropOffPoint: booking?.dropOffPoint || "",
    departureDate: booking?.departureDate || "",
    duration: booking?.duration || "",
    vaccineName: booking?.vaccineName || "",
    vaccinationDate: booking?.vaccinationDate || "",`;

// Insert after the last field before }); in the form state
// Look for paymentDueDate or stepCurrency as the last known field
const anchors = ['stepCurrency:        booking?.stepCurrency', 'paymentDueDate:      booking?.paymentDueDate', 'driverContact:       booking?.driverContact'];
let statePatched = false;
for (const anchor of anchors) {
  const idx = code.indexOf(anchor);
  if (idx !== -1) {
    const lineEnd = code.indexOf('\n', idx) + 1;
    code = code.slice(0, lineEnd) + newStateFields + '\n' + code.slice(lineEnd);
    statePatched = true;
    console.log('✅ Form state fields added after:', anchor.split(':')[0].trim());
    break;
  }
}
if (!statePatched) console.warn('⚠️  Could not find state anchor — new fields not added to form state. Check manually.');

fs.writeFileSync(filePath, code);
console.log('✅ App.jsx updated. Backup at App.jsx.build9.bak');
console.log('');
console.log('Also add to src/index.css:');
console.log('.react-datepicker-popper { z-index:9999!important; max-width:calc(100vw - 16px)!important; }');
console.log('.react-datepicker { max-width:calc(100vw - 16px)!important; font-size:13px!important; }');
console.log('.react-datepicker__month-container { float:none!important; width:100%!important; }');
