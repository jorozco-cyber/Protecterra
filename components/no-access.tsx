"use client";
import { logout } from "./ui";

export default function NoAccess({ email }: { email: string }) {
  return (
    <main className="center-screen">
      <div className="card narrow">
        <h1>Sin acceso</h1>
        <p>
          La cuenta <strong>{email}</strong> no tiene permiso para entrar a Protecterra. Si eres vendedor, pide al
          administrador que active tu portal con este mismo correo.
        </p>
        <button className="btn" onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    </main>
  );
}
