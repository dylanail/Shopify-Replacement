"use client";

import { useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { fmtDate, titleCase } from "@/lib/utils";
import type { TeamMember } from "@/lib/types";
import { Avatar, Badge, Button, Card, Checkbox, Dialog, Field, Input, Loading, Select, Table, Td, Th, Tr, useToast } from "@/components/ui";

export default function TeamPage() {
  const { me } = useStore();
  const toast = useToast();
  const q = useStoreQuery<{ items: TeamMember[]; permissions: string[] }>(["team"], "/team");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: "", role: "member" as "admin" | "member", permissions: [] as string[] });
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const invite = useStoreMutation((sapi) => sapi<{ inviteUrl: string }>("/team/invite", { method: "POST", body: { email: f.email, role: f.role, permissions: f.role === "admin" ? undefined : f.permissions } }), { success: "Invite sent", invalidate: "team", onSuccess: (r) => { setOpen(false); void navigator.clipboard?.writeText(r.inviteUrl).then(() => toast("Invite link copied too", "info")).catch(() => undefined); } });
  const update = useStoreMutation((sapi, v: { id: string; role?: string; permissions?: string[] }) => sapi(`/team/${v.id}`, { method: "PATCH", body: { role: v.role, permissions: v.permissions } }), { success: "Member updated", invalidate: "team", onSuccess: () => setEditing(null) });
  const remove = useStoreMutation((sapi, id: string) => sapi(`/team/${id}`, { method: "DELETE" }), { success: "Member removed", invalidate: "team" });
  const perms = q.data?.permissions ?? [];
  return (
    <div className="space-y-4">
      <Card title="Members" eyebrow="Owner · admins · members with per-area permissions" padded={false} action={<Button size="xs" variant="primary" icon={<Plus size={11} />} onClick={() => { setF({ email: "", role: "member", permissions: [...perms] }); setOpen(true); }}>Invite</Button>}>
        {q.isLoading && <Loading />}
        {q.data && (
          <Table>
            <thead><tr><Th>Member</Th><Th>Role</Th><Th>Permissions</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {q.data.items.map((m) => (
                <Tr key={m.id}>
                  <Td><div className="flex items-center gap-2"><Avatar name={m.name || m.email} size={22} /><div><div className="font-medium">{m.name || m.email}{m.email === me.user.email && <span className="ml-1 text-[10px] text-muted">(you)</span>}</div>{m.name && <div className="text-[11px] text-muted">{m.email}</div>}</div></div></Td>
                  <Td><Badge tone={m.role === "owner" ? "ink" : m.role === "admin" ? "accent" : "neutral"}>{m.role}</Badge></Td>
                  <Td className="text-[11px] text-muted">{m.role === "owner" || m.permissions.length === perms.length ? "everything" : m.permissions.map(titleCase).join(", ") || "none"}</Td>
                  <Td>{m.pending ? <Badge tone="amber">pending invite</Badge> : <span className="text-[11px] text-muted">joined {fmtDate(m.acceptedAt)}</span>}</Td>
                  <Td right>{m.role !== "owner" && <div className="flex justify-end gap-1"><Button size="xs" onClick={() => setEditing(m)}>Edit</Button><button onClick={() => remove.mutate(m.id)} className="rounded px-1 text-muted hover:text-danger"><Trash2 size={13} /></button></div>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card title="Security" eyebrow="Account">
        <ul className="space-y-1 text-xs text-muted"><li>· Two-factor (TOTP) {me.user.totpEnabled ? <Badge tone="green">enabled</Badge> : <Badge>off</Badge>} — enable from your profile menu.</li><li>· Every change, including the assistant's, is written to the audit log with actor and diff.</li><li>· Invites are token links valid until accepted; the invitee signs in with the same email.</li></ul>
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)} title="Invite a teammate" width="max-w-md" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={invite.isPending} disabled={!f.email} onClick={() => invite.mutate()}>Send invite</Button></>}>
        <div className="space-y-3">
          <Field label="Email" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoFocus /></Field>
          <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as "admin" | "member" })}><option value="member">Member — chosen areas</option><option value="admin">Admin — everything except billing ownership</option></Select></Field>
          {f.role === "member" && <Field label="Permissions"><div className="grid grid-cols-2 gap-1">{perms.map((p) => <Checkbox key={p} checked={f.permissions.includes(p)} onChange={(v) => setF({ ...f, permissions: v ? [...f.permissions, p] : f.permissions.filter((x) => x !== p) })} label={titleCase(p)} />)}</div></Field>}
          <p className="inline-flex items-center gap-1 text-[11px] text-muted"><Copy size={11} /> The invite link is copied to your clipboard as well as emailed.</p>
        </div>
      </Dialog>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.email}`} width="max-w-md" footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={update.isPending} onClick={() => editing && update.mutate({ id: editing.id, role: editing.role, permissions: editing.permissions })}>Save</Button></>}>
        {editing && <div className="space-y-3"><Field label="Role"><Select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}><option value="member">Member</option><option value="admin">Admin</option></Select></Field><Field label="Permissions"><div className="grid grid-cols-2 gap-1">{perms.map((p) => <Checkbox key={p} checked={editing.permissions.includes(p)} onChange={(v) => setEditing({ ...editing, permissions: v ? [...editing.permissions, p] : editing.permissions.filter((x) => x !== p) })} label={titleCase(p)} />)}</div></Field></div>}
      </Dialog>
    </div>
  );
}
