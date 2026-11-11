import { Link } from 'react-router-dom';
import { Chip, Head, Ic } from '../bits';
import { useApp } from '../ctx';

export default function Altro() {
  const { app, openSheet } = useApp(), n = app.pendingChanges().length;
  return <>
    <Head title="Altro" />
    <article className="card"><div className="list">{[['/analisi', 'Analisi', 'search'], ['/obiettivi', 'Obiettivi', 'target'], ['/coach', 'Coach', 'coach'], ['/guida', 'Guida', 'book'], ['/profilo', 'Profilo', 'user']].map(x => <Link key={x[0]} className="item" to={x[0]}><Ic n={x[2]} /><span className="ttl grow">{x[1]}</span>{x[0] === '/coach' && n ? <Chip tone="crit">{String(n)}</Chip> : null}<span className="chev"><Ic n="chevR" /></span></Link>)}</div></article>
    <div className="btns" style={{ marginTop: 12 }}><button className="btn" onClick={() => openSheet({ type: 'checkin' })}><Ic n="heart" />Come stai?</button></div>
  </>;
}
