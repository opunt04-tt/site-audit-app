const { v4: uuidv4 } = require('uuid');

function createDefaultTemplate(companyId) {
  return {
    id: uuidv4(),
    companyId,
    name: 'Standard Site Audit',
    isDefault: true,
    createdAt: new Date().toISOString(),
    sections: [
      // ── 1. Job Details ──────────────────────────────────────────────
      {
        id: uuidv4(), name: 'Job Details', order: 0, fields: [
          { id: uuidv4(), name: 'Job Reference',      type: 'text',     required: false, order: 0 },
          { id: uuidv4(), name: 'Client Name',        type: 'text',     required: true,  order: 1 },
          { id: uuidv4(), name: 'Site Address',       type: 'text',     required: true,  order: 2 },
          { id: uuidv4(), name: 'Job Type',           type: 'dropdown', required: true,  order: 3,
            options: ['New Install', 'Maintenance', 'Inspection', 'Repair', 'Other'] },
          { id: uuidv4(), name: 'Date',               type: 'date',     required: true,  order: 4 },
          { id: uuidv4(), name: 'Weather Conditions', type: 'dropdown', required: false, order: 5,
            options: ['Dry', 'Wet', 'Windy', 'Freezing', 'Hot'] },
        ],
      },

      // ── 2. Site Conditions ──────────────────────────────────────────
      {
        id: uuidv4(), name: 'Site Conditions', order: 1, fields: [
          { id: uuidv4(), name: 'Site Access',                  type: 'pass_fail_na', required: false, order: 0 },
          { id: uuidv4(), name: 'PPE Compliance',               type: 'pass_fail_na', required: false, order: 1 },
          { id: uuidv4(), name: 'Signage in Place',             type: 'pass_fail_na', required: false, order: 2 },
          { id: uuidv4(), name: 'Area Secured',                 type: 'pass_fail_na', required: false, order: 3 },
          { id: uuidv4(), name: 'Tools and Equipment Checked',  type: 'pass_fail_na', required: false, order: 4 },
        ],
      },

      // ── 3. Works Completed ──────────────────────────────────────────
      {
        id: uuidv4(), name: 'Works Completed', order: 2, fields: [
          { id: uuidv4(), name: 'Description of Works',    type: 'textarea', required: false, order: 0 },
          { id: uuidv4(), name: 'Percentage Complete',     type: 'number',   required: false, order: 1 },
          { id: uuidv4(), name: 'Any Outstanding Works',   type: 'yes_no',   required: false, order: 2 },
          { id: uuidv4(), name: 'Outstanding Works Detail',type: 'textarea', required: false, order: 3 },
        ],
      },

      // ── 4. Hazards Identified ───────────────────────────────────────
      {
        id: uuidv4(), name: 'Hazards Identified', order: 3, fields: [
          { id: uuidv4(), name: 'Any Hazards Found',          type: 'yes_no',   required: false, order: 0 },
          { id: uuidv4(), name: 'Hazard Details',             type: 'textarea', required: false, order: 1 },
          { id: uuidv4(), name: 'Immediate Action Taken',     type: 'textarea', required: false, order: 2 },
          { id: uuidv4(), name: 'Reported to Site Manager',   type: 'yes_no',   required: false, order: 3 },
        ],
      },

      // ── 5. Holdups ──────────────────────────────────────────────────
      {
        id: uuidv4(), name: 'Holdups', order: 4, fields: [
          { id: uuidv4(), name: 'Any Holdups Today',          type: 'yes_no',   required: false, order: 0 },
          { id: uuidv4(), name: 'Reason for Holdup',          type: 'textarea', required: false, order: 1 },
          { id: uuidv4(), name: 'Who is Responsible',         type: 'text',     required: false, order: 2 },
          { id: uuidv4(), name: 'Estimated Delay in Days',    type: 'number',   required: false, order: 3 },
        ],
      },

      // ── 6. Materials ────────────────────────────────────────────────
      {
        id: uuidv4(), name: 'Materials', order: 5, fields: [
          { id: uuidv4(), name: 'Materials Used',    type: 'textarea', required: false, order: 0 },
          { id: uuidv4(), name: 'Materials Needed',  type: 'textarea', required: false, order: 1 },
        ],
      },

      // ── 7. Sign Off ─────────────────────────────────────────────────
      {
        id: uuidv4(), name: 'Sign Off', order: 6, fields: [
          { id: uuidv4(), name: 'Works Safe to Leave',   type: 'yes_no',   required: false, order: 0 },
          { id: uuidv4(), name: 'Next Visit Required',   type: 'yes_no',   required: false, order: 1 },
          { id: uuidv4(), name: 'Next Visit Date',       type: 'date',     required: false, order: 2 },
          { id: uuidv4(), name: 'Additional Notes',      type: 'textarea', required: false, order: 3 },
        ],
      },
    ],
  };
}

module.exports = { createDefaultTemplate };
