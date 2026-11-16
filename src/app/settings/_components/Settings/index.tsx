"use client";
import { IconDownload } from "@tabler/icons-react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import usePwa from "use-pwa";
import styles from "./style.module.css";

const Toggle = dynamic(async () => import("react-toggle"), { ssr: false });

export default function Settings(): React.JSX.Element {
  const { setTheme, theme } = useTheme();
  const { canInstall, install, isInstalled, isSupported } = usePwa();

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <label className={styles.label}>
          <span className={styles.labelText}>ダークモードを有効にする</span>
          <Toggle
            onChange={(e) => {
              setTheme(e.currentTarget.checked ? "dark" : "light");
            }}
            defaultChecked={theme === "dark"}
          />
        </label>
        {isSupported && !isInstalled ? (
          <div className={styles.label}>
            <span className={styles.labelText}>ホーム画面に追加する</span>
            <button
              onClick={() => {
                void install();
              }}
              className={styles.button}
              disabled={!canInstall}
            >
              <IconDownload size={18} />
              <span className={styles.buttonText}>インストール</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
