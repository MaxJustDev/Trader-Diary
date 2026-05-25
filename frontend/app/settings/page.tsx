"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Folder, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";

type ValidationState = "idle" | "checking" | "valid" | "invalid";

interface FundOverride {
    id: number;
    fund_name: string;
    server_pattern: string;
    mt5_base_path: string | null;
}

function PathInput({
    label,
    placeholder,
    value,
    onChange,
    onValidate,
    state,
    detail,
    onSave,
    saving,
}: {
    label: string;
    placeholder: string;
    value: string;
    onChange: (v: string) => void;
    onValidate: () => void;
    state: ValidationState;
    detail: string | null;
    onSave: () => void;
    saving: boolean;
}) {
    const stateIcon =
        state === "checking" ? <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> :
        state === "valid" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
        state === "invalid" ? <XCircle className="w-4 h-4 text-rose-400" /> :
        <Folder className="w-4 h-4 text-slate-500" />;

    return (
        <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 6, color: "var(--text-soft)", fontSize: 13, fontWeight: 600 }}>
                {label}
            </label>
            <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1, position: "relative" }}>
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        className="input-diary"
                        style={{ paddingLeft: 36, fontFamily: "var(--font-jbmono), monospace", fontSize: 12, width: "100%" }}
                    />
                    <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
                        {stateIcon}
                    </div>
                </div>
                <button
                    onClick={onValidate}
                    disabled={!value.trim() || state === "checking"}
                    style={{
                        padding: "0 14px", fontSize: 12, fontWeight: 600,
                        background: "rgba(34,211,238,0.10)", border: "1px solid rgba(34,211,238,0.30)",
                        color: "var(--cyan)", borderRadius: 6, cursor: state === "checking" ? "wait" : "pointer",
                        opacity: !value.trim() ? 0.4 : 1,
                    }}
                >
                    Validate
                </button>
                <button
                    onClick={onSave}
                    disabled={saving}
                    style={{
                        padding: "0 14px", fontSize: 12, fontWeight: 600,
                        background: "rgba(240,180,41,0.10)", border: "1px solid rgba(240,180,41,0.30)",
                        color: "var(--gold)", borderRadius: 6, cursor: saving ? "wait" : "pointer",
                        opacity: saving ? 0.5 : 1,
                    }}
                >
                    {saving ? "..." : "Save"}
                </button>
            </div>
            {detail && (
                <div style={{
                    marginTop: 6, fontSize: 11, fontFamily: "var(--font-jbmono), monospace",
                    color: state === "valid" ? "var(--emerald)" : state === "invalid" ? "var(--rose)" : "var(--text-muted)",
                }}>
                    {detail}
                </div>
            )}
        </div>
    );
}

export default function SettingsPage() {
    const [defaultMt5Path, setDefaultMt5Path] = useState("");
    const [defaultTerminalsDir, setDefaultTerminalsDir] = useState("");
    const [funds, setFunds] = useState<FundOverride[]>([]);

    const [mt5State, setMt5State] = useState<ValidationState>("idle");
    const [mt5Detail, setMt5Detail] = useState<string | null>(null);
    const [mt5Saving, setMt5Saving] = useState(false);

    const [dirState, setDirState] = useState<ValidationState>("idle");
    const [dirDetail, setDirDetail] = useState<string | null>(null);
    const [dirSaving, setDirSaving] = useState(false);

    const [fundDrafts, setFundDrafts] = useState<Record<number, string>>({});
    const [fundSaving, setFundSaving] = useState<number | null>(null);

    const loadAll = useCallback(async () => {
        try {
            const data = await apiClient.settings.getAll();
            setDefaultMt5Path(data.settings.default_mt5_base_path ?? "");
            setDefaultTerminalsDir(data.settings.default_terminals_dir ?? "");
            setFunds(data.fund_overrides);
            setFundDrafts(Object.fromEntries(data.fund_overrides.map((f) => [f.id, f.mt5_base_path ?? ""])));
        } catch (e: any) {
            toast.error(`Failed to load settings: ${e.message ?? "unknown"}`);
        }
    }, []);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    async function validateMt5() {
        setMt5State("checking");
        setMt5Detail(null);
        try {
            const r = await apiClient.settings.validateMt5Path(defaultMt5Path);
            if (r.has_terminal_exe) {
                setMt5State("valid");
                setMt5Detail(`OK — found terminal64.exe at ${r.exe_path}`);
            } else if (r.exists) {
                setMt5State("invalid");
                setMt5Detail("Folder exists but no terminal64.exe inside");
            } else {
                setMt5State("invalid");
                setMt5Detail("Folder does not exist");
            }
        } catch (e: any) {
            setMt5State("invalid");
            setMt5Detail(`Validation error: ${e.message ?? "unknown"}`);
        }
    }

    async function validateDir() {
        setDirState("checking");
        setDirDetail(null);
        try {
            const r = await apiClient.settings.validateTerminalsDir(defaultTerminalsDir);
            if (r.exists) {
                setDirState("valid");
                setDirDetail("Directory exists");
            } else if (r.writable) {
                setDirState("valid");
                setDirDetail("Directory will be created on first use");
            } else {
                setDirState("invalid");
                setDirDetail("Parent directory missing or not writable");
            }
        } catch (e: any) {
            setDirState("invalid");
            setDirDetail(`Validation error: ${e.message ?? "unknown"}`);
        }
    }

    async function saveMt5() {
        setMt5Saving(true);
        try {
            await apiClient.settings.upsert("default_mt5_base_path", defaultMt5Path || null);
            toast.success("Default MT5 base path saved");
        } catch (e: any) {
            toast.error(`Save failed: ${e.message ?? "unknown"}`);
        } finally {
            setMt5Saving(false);
        }
    }

    async function saveDir() {
        setDirSaving(true);
        try {
            await apiClient.settings.upsert("default_terminals_dir", defaultTerminalsDir || null);
            toast.success("Default terminals directory saved");
        } catch (e: any) {
            toast.error(`Save failed: ${e.message ?? "unknown"}`);
        } finally {
            setDirSaving(false);
        }
    }

    async function saveFund(fundId: number) {
        setFundSaving(fundId);
        try {
            await apiClient.settings.setFundMt5Path(fundId, fundDrafts[fundId] ?? "");
            toast.success("Fund MT5 path saved");
            await loadAll();
        } catch (e: any) {
            toast.error(`Save failed: ${e.message ?? "unknown"}`);
        } finally {
            setFundSaving(null);
        }
    }

    return (
        <div className="page-enter" style={{ padding: "clamp(16px, 3vw, 36px)", maxWidth: 960 }}>
            <div className="section-label" style={{ marginBottom: 6 }}>Configuration</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f0f4f8", margin: 0, marginBottom: 24, letterSpacing: "-0.01em" }}>
                MT5 Folder Settings
            </h1>

            <div style={{
                background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14,
                padding: 22, marginBottom: 22,
            }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--gold)", marginTop: 0, marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    Global defaults
                </h2>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>
                    Fallback used when an account has no explicit path and no fund override matches.
                </p>

                <PathInput
                    label="Default MT5 installation folder"
                    placeholder='C:\Program Files\MetaTrader 5'
                    value={defaultMt5Path}
                    onChange={setDefaultMt5Path}
                    onValidate={validateMt5}
                    state={mt5State}
                    detail={mt5Detail}
                    onSave={saveMt5}
                    saving={mt5Saving}
                />

                <PathInput
                    label="Terminals copy directory (where per-account copies are created)"
                    placeholder='C:\Program Files'
                    value={defaultTerminalsDir}
                    onChange={setDefaultTerminalsDir}
                    onValidate={validateDir}
                    state={dirState}
                    detail={dirDetail}
                    onSave={saveDir}
                    saving={dirSaving}
                />
            </div>

            <div style={{
                background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14,
                padding: 22,
            }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--gold)", marginTop: 0, marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    Per-fund overrides
                </h2>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>
                    Each fund (broker) can point to its own MT5 install instead of the global default.
                    Leave empty to fall back to global.
                </p>

                {funds.length === 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 13 }}>
                        <AlertCircle className="w-4 h-4" />
                        No funds configured yet. Set up funds on the Funds page first.
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {funds.map((f) => (
                            <div key={f.id} style={{
                                padding: 14, borderRadius: 10,
                                background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)",
                            }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)" }}>{f.fund_name}</div>
                                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-jbmono), monospace" }}>
                                            server: {f.server_pattern}
                                        </div>
                                    </div>
                                    {f.mt5_base_path && (
                                        <span style={{
                                            fontSize: 10, padding: "2px 8px", borderRadius: 99,
                                            background: "rgba(52,211,153,0.10)", color: "var(--emerald)",
                                            border: "1px solid rgba(52,211,153,0.25)",
                                        }}>
                                            override active
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input
                                        type="text"
                                        value={fundDrafts[f.id] ?? ""}
                                        onChange={(e) => setFundDrafts((p) => ({ ...p, [f.id]: e.target.value }))}
                                        placeholder='C:\Program Files\FTMO MetaTrader 5'
                                        className="input-diary"
                                        style={{ flex: 1, fontFamily: "var(--font-jbmono), monospace", fontSize: 12 }}
                                    />
                                    <button
                                        onClick={() => saveFund(f.id)}
                                        disabled={fundSaving === f.id}
                                        style={{
                                            padding: "0 14px", fontSize: 12, fontWeight: 600,
                                            background: "rgba(240,180,41,0.10)", border: "1px solid rgba(240,180,41,0.30)",
                                            color: "var(--gold)", borderRadius: 6,
                                            cursor: fundSaving === f.id ? "wait" : "pointer",
                                            opacity: fundSaving === f.id ? 0.5 : 1,
                                        }}
                                    >
                                        {fundSaving === f.id ? "..." : "Save"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ marginTop: 20, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                <strong style={{ color: "var(--text-soft)" }}>Resolution order:</strong>{" "}
                Account explicit path → Fund override → Global default → Env <code style={{ fontFamily: "var(--font-jbmono), monospace" }}>MT5_BASE_PATH</code> → Hardcoded fallback.
            </div>
        </div>
    );
}
