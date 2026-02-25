# Button Styling Guide

Standard button styling patterns used across the application. Reference: `superAdmin` module.

---

## 1. List Component (Toolbar Buttons)

**HTML Pattern:**
```html
<button pButton class="modern-button p-button-primary" (click)="action()">
    <i class="pi pi-plus mr-2"></i>Add Item
</button>
<button pButton class="modern-button p-button-outlined p-button-danger" (click)="delete()">
    <i class="pi pi-trash mr-2"></i>Delete
</button>
```

**SCSS Pattern:**
```scss
.modern-button {
  border-radius: $radius-sm !important;
  font-weight: 600;
  padding: 0.65rem 1.25rem;

  &.p-button-primary {
    background: linear-gradient(135deg, #2196f3, #1976d2);
    color: white;
    border: none;
    box-shadow: 0 4px 10px rgba(33, 150, 243, 0.3);
    transition: all 0.2s ease;

    &:hover {
      opacity: 1;
      transform: translateY(-1px);
      box-shadow: 0 6px 15px rgba(33, 150, 243, 0.4);
    }

    &:focus {
      box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
    }
  }

  &.p-button-outlined {
    background: transparent;
    border: 1px solid var(--border-color);

    &.p-button-danger {
      border-color: var(--error-color);
      color: var(--error-color);

      &:hover {
        background: rgba(var(--error-rgb), 0.04);
      }
    }
  }
}
```

---

## 2. Add/Edit Component (Form Page)

**HTML Pattern:**
```html
<!-- Back button -->
<button pButton class="p-button-text p-button-plain back-button" (click)="goBack()">
    <i class="pi pi-arrow-left text-xl"></i>
</button>

<!-- Cancel button -->
<button pButton type="button" label="Cancel" class="p-button-outlined btn-cancel" (click)="onCancel()"></button>

<!-- Save button -->
<button pButton type="button" label="Save" class="p-button-primary btn-save" (click)="onSave()">
    <i class="pi pi-check mr-2"></i>
</button>
```

**SCSS Pattern:**
```scss
.back-button {
  width: 36px !important;
  height: 36px !important;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
  transition: all 0.2s ease !important;

  &:hover {
    background: var(--hover-background) !important;
    transform: translateX(-2px);
  }
}

.btn-cancel {
  background: var(--card-background) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-color) !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  font-weight: 600;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: var(--hover-background) !important;
    border-color: var(--secondary-color) !important;
  }
}

.btn-save {
  background: linear-gradient(135deg, #2196f3, #1976d2) !important;
  color: white !important;
  border: none !important;
  box-shadow: 0 4px 10px rgba(33, 150, 243, 0.3);
  font-weight: 600;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 15px rgba(33, 150, 243, 0.4);
  }

  &:focus {
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
}
```

---

## 3. View Component (Detail Page)

**HTML Pattern:** Uses native `<button>` elements (not pButton) for action buttons.
```html
<!-- Back button (same as add/edit) -->
<button pButton class="p-button-text p-button-plain back-button" (click)="goBack()">
    <i class="pi pi-arrow-left text-xl"></i>
</button>

<!-- Action buttons in header-actions div -->
<div class="header-actions">
    <button class="btn-primary" (click)="onEdit()">
        <i class="pi pi-pencil"></i>
        Edit
    </button>
    <button class="btn-danger" type="button" (click)="confirmDelete()">
        <i class="pi pi-trash"></i>
        Delete
    </button>
</div>
```

**SCSS Pattern:**
```scss
.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;

  button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    border-radius: $radius-sm;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .btn-primary {
    background: linear-gradient(135deg, #2196f3, #1976d2);
    color: white;
    box-shadow: 0 4px 10px rgba(33, 150, 243, 0.3);

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 15px rgba(33, 150, 243, 0.4);
    }
  }

  .btn-secondary {
    background: var(--card-background);
    border: 1px solid var(--border-color);
    color: var(--text-color);

    &:hover {
      background: var(--hover-background);
      border-color: var(--secondary-color);
    }
  }

  .btn-danger {
    background: linear-gradient(135deg, #f44336, #d32f2f);
    color: white;
    box-shadow: 0 4px 10px rgba(244, 67, 54, 0.3);

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 15px rgba(244, 67, 54, 0.4);
    }
  }
}
```

---

## 4. Dialog Buttons (Popups/Modals)

Same `btn-cancel` / `btn-save` pattern as Add/Edit, applied inside `.popup-actions`. For dialogs with a middle action (e.g., Validate), use `btn-secondary`.

**HTML Pattern:**
```html
<div class="popup-actions">
    <button pButton type="button" label="Cancel" class="p-button-outlined btn-cancel" (click)="onCancel()"></button>
    <button pButton type="button" label="Save" class="p-button-primary btn-save" (click)="onSubmit()">
        <i class="pi pi-save mr-2"></i>
    </button>
</div>
```

---

## 5. Design Tokens Summary

| Token | Value |
|-------|-------|
| Primary gradient | `linear-gradient(135deg, #2196f3, #1976d2)` |
| Danger gradient | `linear-gradient(135deg, #f44336, #d32f2f)` |
| Primary shadow | `0 4px 10px rgba(33, 150, 243, 0.3)` |
| Primary shadow hover | `0 6px 15px rgba(33, 150, 243, 0.4)` |
| Danger shadow | `0 4px 10px rgba(244, 67, 54, 0.3)` |
| Danger shadow hover | `0 6px 15px rgba(244, 67, 54, 0.4)` |
| Cancel shadow | `0 1px 3px rgba(0, 0, 0, 0.08)` |
| Back button size | `36px` circular |
| Hover transform | `translateY(-1px)` |
| Back hover transform | `translateX(-2px)` |

---

## Completed Modules
- superAdmin (reference)
- database
- connection
- access
- dataset (view-dataset, add-custom-field-dialog, edit-dataset-fields-dialog; add-dataset & edit-dataset use query editor toolbar - different pattern, no changes needed)
