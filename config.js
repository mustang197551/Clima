/* config.js — CONFIGURACIÓN. Es el único archivo que tenés que editar. */
globalThis.CONFIG = {
  // Ciudad que vigila el sistema de notificaciones (y la que abre la app la primera vez).
  // Si hay varias con el mismo nombre, agregá la provincia: "San Martín, Mendoza"
  ciudad: "Buenos Aires",

  // Nombre del canal de notificaciones en la app ntfy. Funciona como una contraseña:
  // quien lo conozca recibe las alertas. Compartilo solo con quien quieras avisar.
  ntfyTema: "clima-consenso-a916dab8",

  // Desde qué nivel avisar: 1 = amarillas en adelante, 2 = solo naranjas y rojas, 3 = solo rojas
  nivelMinimo: 1
};
