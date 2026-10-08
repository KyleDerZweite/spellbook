// Runtime configuration belongs to the composed database, never to public source state.
const enabled = new WeakMap<object, boolean>();
export function configureComboAdapter(owner: object, value: boolean) {
  enabled.set(owner, value);
}
export function comboAdapterEnabled(owner: object) {
  return enabled.get(owner) ?? false;
}

const readOnly = new WeakSet<object>();
export function configureComboReadOnly(owner: object, value: boolean) {
  if (value) readOnly.add(owner);
}
export function comboTransactionReadOnly(owner: object) {
  return readOnly.has(owner);
}
