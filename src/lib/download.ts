/* Salvataggio di un file di testo sul dispositivo.
   Su iPhone e iPad lo scaricamento da un'app installata non è affidabile: lì si apre il foglio di condivisione
   ("Salva su File", Calendario…). Altrove è un normale scaricamento. */
function isIOS(): boolean {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
/** true se il file è stato consegnato; false se la persona ha chiuso il foglio di condivisione. */
export async function saveFile(name: string, text: string, type: string): Promise<boolean> {
  if (isIOS() && typeof navigator.canShare === 'function' && typeof File === 'function') {
    const file = new File([text], name, { type: type.split(';')[0] });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return true; }
      catch (e) { if ((e as DOMException).name === 'AbortError') return false; /* condivisione non riuscita: si prova lo scaricamento */ }
    }
  }
  download(name, text, type);
  return true;
}
