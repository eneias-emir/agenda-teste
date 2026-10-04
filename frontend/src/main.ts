import { Component, inject, signal, OnInit } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { HttpClient, HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

interface Contact { id: number; name: string; phone: string; }

@Component({
  selector: 'app-root', standalone: true, imports: [FormsModule],
  template: `
    <main>
      <header><span class="eyebrow">ANGULAR · NESTJS · POSTGRESQL</span><h1>Minha agenda</h1><p>Seus contatos, em um só lugar.</p></header>
      @if (error()) { <div role="alert" class="error">{{ error() }}</div> }
      @if (message()) { <div role="status" class="success">{{ message() }}</div> }
      <section class="card">
        <h2>{{ editingId === null ? 'Novo contato' : 'Alterar contato' }}</h2>
        <form #form="ngForm" (ngSubmit)="save()">
          <label>Nome<input name="name" [(ngModel)]="name" required maxlength="100" placeholder="Ex.: Maria Silva" [disabled]="busy()"></label>
          <label>Telefone<input name="phone" [(ngModel)]="phone" type="tel" required minlength="3" maxlength="30" pattern="[+0-9 ().-]+" placeholder="(11) 99999-9999" [disabled]="busy()"></label>
          <div class="actions"><button type="submit" [disabled]="form.invalid || !name.trim() || busy()">{{ busy() ? 'Aguarde…' : editingId === null ? 'Adicionar contato' : 'Salvar alterações' }}</button>
          @if (editingId !== null) { <button type="button" class="secondary" (click)="cancel()" [disabled]="busy()">Cancelar</button> }</div>
        </form>
      </section>
      <section class="card"><div class="list-heading"><h2>Contatos <span class="count">{{ contacts().length }}</span></h2><button class="secondary" (click)="load()" [disabled]="loading() || busy()">Atualizar</button></div>
        @if (loading()) { <p role="status">Carregando contatos…</p> }
        @else if (contacts().length === 0) { <p class="empty">Sua agenda está vazia. Adicione o primeiro contato acima.</p> }
        @else { <div class="table-wrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Ações</th></tr></thead><tbody>
          @for (contact of contacts(); track contact.id) { <tr><td>{{ contact.name }}</td><td>{{ contact.phone }}</td><td class="row-actions"><button class="secondary" (click)="edit(contact)" [disabled]="busy()" [attr.aria-label]="'Alterar ' + contact.name">Alterar</button><button class="danger" (click)="remove(contact)" [disabled]="busy()" [attr.aria-label]="'Excluir ' + contact.name">Excluir</button></td></tr> }
        </tbody></table></div> }
      </section>
      <footer>Agenda de demonstração · Sem autenticação</footer>
    </main>`
})
class AppComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly contacts = signal<Contact[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  name = ''; phone = ''; editingId: number | null = null;
  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true); this.error.set('');
    this.http.get<Contact[]>('/api/contacts').subscribe({ next: data => { this.contacts.set(data); this.loading.set(false); }, error: e => { this.fail(e); this.loading.set(false); } });
  }
  save() {
    if (this.busy() || !this.name.trim()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    const data = { name: this.name.trim(), phone: this.phone.trim() };
    const request = this.editingId === null ? this.http.post<Contact>('/api/contacts', data) : this.http.put<Contact>('/api/contacts/' + this.editingId, data);
    request.subscribe({ next: () => { this.busy.set(false); this.cancel(); this.message.set('Contato salvo.'); this.load(); }, error: e => this.fail(e) });
  }
  edit(contact: Contact) { this.editingId = contact.id; this.name = contact.name; this.phone = contact.phone; this.message.set(''); this.error.set(''); }
  cancel() { this.editingId = null; this.name = ''; this.phone = ''; }
  remove(contact: Contact) {
    if (!confirm('Excluir o contato ' + contact.name + '?')) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    this.http.delete('/api/contacts/' + contact.id).subscribe({ next: () => { this.busy.set(false); if (this.editingId === contact.id) this.cancel(); this.message.set('Contato excluído.'); this.load(); }, error: e => this.fail(e) });
  }
  private fail(error: HttpErrorResponse) { this.busy.set(false); this.error.set(error.status === 400 ? 'Confira o nome e o telefone (3 a 30 caracteres, números e pontuação de telefone).' : 'Não foi possível concluir a operação. Verifique se a API e o banco estão disponíveis.'); }
}
bootstrapApplication(AppComponent, { providers: [provideHttpClient()] }).catch(console.error);
