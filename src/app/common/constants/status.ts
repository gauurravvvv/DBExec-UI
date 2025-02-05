export const STATUS = [
  { value: '1', label: 'Active' },
  { value: '0', label: 'Inactive' },
];

export const WAREHOUSE = [
  { value: 1, label: 'Snowflake' },
  { value: 2, label: 'Postgres' },
];

export const USER_STATUS = [
  { value: '0', label: 'Inactive' },
  { value: '1', label: 'Active' },
  { value: '3', label: 'Locked' },
];

export const USER_STATUS_OBJ = {
  INACTIVE: 0,
  ACTIVE: 1,
  LOCKED: 3,
};

export const USER_STATE = [
  { value: 0, label: 'Inactive', icon: 'pi pi-times' },
  { value: 1, label: 'Active', icon: 'pi pi-check' },
  {
    value: 3,
    labelLocked: 'Locked',
    labelUnlocked: 'Unlocked',
    iconLocked: 'pi pi-lock',
    iconUnlocked: 'pi pi-unlock',
  },
];
