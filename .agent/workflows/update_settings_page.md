---
description: Update SettingsPage to include Gazette Q4 and Tax Invoice number settings
---

## Steps to apply the changes

1. **Open the Settings page component**:
   - Path: `../powerkeyFrontend/src/components/pages/SettingsPage.tsx`
   - Open the file in your editor.

2. **Update the component state**:
   ```tsx
   const [formData, setFormData] = useState({
     invoice_prefix: '',
     current_invoice_number: '',
     current_estimate_number: '',
     invoice_separators: true,
     gazette_q4: '',
     current_tax_invoice_number: ''
   });
   ```

3. **Populate the state in `useEffect`** (inside the `if (selectedCompany)` block):
   ```tsx
   setFormData({
     invoice_prefix: selectedCompany.invoice_prefix || '',
     current_invoice_number: selectedCompany.current_invoice_number?.toString() || '',
     current_estimate_number: selectedCompany.current_estimate_number?.toString() || '',
     invoice_separators: (selectedCompany.invoice_separators !== undefined && selectedCompany.invoice_separators !== false && Number(selectedCompany.invoice_separators) !== 0),
     gazette_q4: (selectedCompany as any).gazette_q4 || 'HQ01',
     current_tax_invoice_number: selectedCompany.current_tax_invoice_number?.toString() || '0'
   });
   ```

4. **Send the new fields to the backend in `handleSave`**:
   ```tsx
   data.append('current_estimate_number', formData.current_estimate_number);
   data.append('invoice_separators', formData.invoice_separators ? '1' : '0');
   data.append('gazette_q4', formData.gazette_q4);
   data.append('current_tax_invoice_number', formData.current_tax_invoice_number);
   ```

5. **Add UI controls for the new settings** (inside the invoice/estimate settings block, after the existing fields):
   ```tsx
   {/* Gazette Q4 */}
   <div>
     <label className="block text-xs font-medium text-gray-500 mb-1 mt-2">Gazette Q4</label>
     {isEditing ? (
       <input type="text" value={formData.gazette_q4} onChange={e => setFormData({ ...formData, gazette_q4: e.target.value })} className="w-full px-2 py-1 text-sm border rounded" placeholder="e.g. HQ01" />
     ) : (
       <span className="text-sm font-medium">{(selectedCompany as any)?.gazette_q4 || 'HQ01'}</span>
     )}
   </div>
   {/* Gazette X5 Start */}
   <div>
     <label className="block text-xs font-medium text-gray-500 mb-1 mt-2">Gazette X5 Start</label>
     {isEditing ? (
       <input type="number" value={formData.current_tax_invoice_number} onChange={e => setFormData({ ...formData, current_tax_invoice_number: e.target.value })} className="w-full px-2 py-1 text-sm border rounded" placeholder="e.g. 0" />
     ) : (
       <span className="text-sm font-medium">{selectedCompany?.current_tax_invoice_number || '0'}</span>
     )}
   </div>
   ```

6. **Save the file** and ensure there are no TypeScript import errors (the component already imports `useCompany` and `axiosInstance`).

7. **Test the UI**:
   - Open the Settings page in the application.
   - Verify you can edit and save the new Gazette fields.
   - Confirm the backend receives the new fields (`gazette_q4` and `current_tax_invoice_number`).

8. **Commit the changes** to your repository.

---

**Note**: After applying these steps, the frontend will be able to edit the Gazette configuration, and the backend already supports the new fields for invoice number generation.
