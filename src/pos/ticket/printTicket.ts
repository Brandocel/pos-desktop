import { buildTicketHTML } from "./ticketHtml";

export function printTicket(params: Parameters<typeof buildTicketHTML>[0]) {
  const html = buildTicketHTML(params);
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) {
    alert("No se pudo abrir la ventana de impresión. Revisa permisos/setting de Electron.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
