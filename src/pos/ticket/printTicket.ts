import { buildTicketHTML } from "./ticketHtml";

export function printTicket(params: Parameters<typeof buildTicketHTML>[0]) {
  const html = buildTicketHTML(params);

  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) {
    alert("No se pudo abrir la ventana de impresión. Revisa permisos/setting de Electron.");
    return;
  }

  // ✅ Asegura foco
  try {
    w.focus();
  } catch {}

  // ✅ Escribe HTML
  w.document.open();
  w.document.write(html);
  w.document.close();

  // ✅ Fallback por si el script interno no llega a correr (raro, pero pasa)
  // (Tu HTML ya trae window.onload => print + close, esto es solo respaldo)
  setTimeout(() => {
    try {
      if (!w.closed) {
        w.focus();
        w.print();
        setTimeout(() => {
          try {
            w.close();
          } catch {}
        }, 400);
      }
    } catch {}
  }, 1200);
}
