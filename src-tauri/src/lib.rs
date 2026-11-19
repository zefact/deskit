/// AWS CLI のプロファイルの確認・編集・切り替え
mod aws_profiles;
/// 外部コマンドの実行と、設定ファイルの安全な書き込み
mod cmd;
/// Git アカウント (名前・メール・SSHの別名) の確認・切り替え
mod git_accounts;
mod hash;
mod host_keys;
mod ssh_edit;
/// 元の書き方を崩さない INI ファイルの編集 (~/.aws/config など)
mod ini;
/// ~/.ssh/config の Host (別名) の読み取り
mod ssh_config;

/// 「Deskitについて」メニューのID (押されたらフロントへ通知する)
#[cfg(target_os = "macos")]
const ABOUT_MENU_ID: &str = "about";

/// macOS用の日本語メニューバーを構築する。
///
/// 編集メニューを入れておかないと、WKWebView上で ⌘C / ⌘V / ⌘A が効かない
#[cfg(target_os = "macos")]
fn build_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

    // OS標準のAboutパネルではなく、アプリ内の「Deskitについて」を出す
    let about = MenuItem::with_id(app, ABOUT_MENU_ID, "Deskitについて", true, None::<&str>)?;

    let app_menu = Submenu::with_items(
        app,
        "Deskit",
        true,
        &[
            &about,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, Some("サービス"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("Deskitを隠す"))?,
            &PredefinedMenuItem::hide_others(app, Some("ほかを隠す"))?,
            &PredefinedMenuItem::show_all(app, Some("すべてを表示"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("Deskitを終了"))?,
        ],
    )?;

    let edit = Submenu::with_items(
        app,
        "編集",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("取り消す"))?,
            &PredefinedMenuItem::redo(app, Some("やり直す"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("カット"))?,
            &PredefinedMenuItem::copy(app, Some("コピー"))?,
            &PredefinedMenuItem::paste(app, Some("ペースト"))?,
            &PredefinedMenuItem::select_all(app, Some("すべてを選択"))?,
        ],
    )?;

    let view = Submenu::with_items(
        app,
        "表示",
        true,
        &[&PredefinedMenuItem::fullscreen(
            app,
            Some("フルスクリーンにする"),
        )?],
    )?;

    let window = Submenu::with_items(
        app,
        "ウインドウ",
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some("しまう"))?,
            &PredefinedMenuItem::maximize(app, Some("拡大/縮小"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some("ウインドウを閉じる"))?,
        ],
    )?;

    Menu::with_items(app, &[&app_menu, &edit, &view, &window])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|_app| {
            // メニューバーを日本語化 (macOSのみ)
            #[cfg(target_os = "macos")]
            {
                use tauri::{Emitter, Manager};
                let menu = build_menu(_app.handle())?;
                _app.set_menu(menu)?;
                _app.on_menu_event(|app, event| {
                    if event.id() == ABOUT_MENU_ID {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.emit("show-about", ());
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hash::hash_file,
            git_accounts::git_overview,
            git_accounts::git_ssh_test,
            host_keys::git_host_keys,
            host_keys::git_trust_host,
            git_accounts::git_set_global_identity,
            git_accounts::git_inspect_repo,
            git_accounts::git_apply_repo,
            git_accounts::git_clear_repo_identity,
            ssh_edit::ssh_overview,
            ssh_edit::ssh_list_keys,
            ssh_edit::ssh_save_host,
            ssh_edit::ssh_delete_host,
            aws_profiles::aws_overview,
            aws_profiles::aws_cli_version,
            aws_profiles::aws_save_profile,
            aws_profiles::aws_delete_profile,
            aws_profiles::aws_select_profile,
            aws_profiles::aws_install_integration,
            aws_profiles::aws_uninstall_integration,
            aws_profiles::aws_identity,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
