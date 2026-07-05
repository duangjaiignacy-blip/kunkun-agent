// kunkun · Tauri 壳（一期）：桌宠透明窗 + ⌥Space 非激活浮面板 + 菜单栏托盘 + 拉起 Python 后端
// 浮窗骨架照抄 ahkohd/tauri-macos-spotlight-example（v2 分支），坑位见 docs/macOS-App-方案与架构.md
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, RunEvent,
};
use tauri_nspanel::ManagerExt;
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

mod window;
use window::WebviewWindowExt;

pub const PANEL_LABEL: &str = "panel";

#[derive(Clone, Serialize)]
struct BackendInfo {
    port: u16,
    token: String,
}

pub struct AppState {
    backend: Mutex<Option<BackendInfo>>,
    child: Mutex<Option<Child>>,
    // 面板因失焦刚刚自动隐藏的时刻：用来防「点桌宠关面板→失焦隐藏→点击又打开」的抖动
    pub panel_hidden_at: Mutex<Option<Instant>>,
}

#[tauri::command]
fn get_backend_info(state: tauri::State<AppState>) -> Option<BackendInfo> {
    state.backend.lock().unwrap().clone()
}

#[tauri::command]
fn toggle_panel(app: tauri::AppHandle) {
    toggle(&app, false);
}

/// 退出整个 App：桌宠上「退出」确认后调这里。app.exit 会触发 RunEvent::Exit，
/// 我们在 run() 尾部的收尾逻辑会顺带杀掉 Python 后端，做到干净退出。
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn hide_panel(app: tauri::AppHandle) {
    if let Ok(panel) = app.get_webview_panel(PANEL_LABEL) {
        if panel.is_visible() {
            panel.hide();
            let _ = app.emit("kunkun-state", serde_json::json!({ "panelOpen": false }));
        }
    }
}

/// 开/关浮面板。force_show=true 时只开不关（托盘菜单用）。
fn toggle(app: &tauri::AppHandle, force_show: bool) {
    let Some(win) = app.get_webview_window(PANEL_LABEL) else {
        return;
    };
    match app
        .get_webview_panel(PANEL_LABEL)
        .or_else(|_| win.to_spotlight_panel())
    {
        Ok(panel) => {
            if panel.is_visible() && !force_show {
                panel.hide();
                let _ = app.emit("kunkun-state", serde_json::json!({ "panelOpen": false }));
            } else if !panel.is_visible() {
                // 面板刚因失焦自动隐藏（用户点了桌宠想关掉它）→ 这次点击不再重新打开
                let recently_hidden = app
                    .state::<AppState>()
                    .panel_hidden_at
                    .lock()
                    .unwrap()
                    .map(|t| t.elapsed().as_millis() < 350)
                    .unwrap_or(false);
                if recently_hidden && !force_show {
                    return;
                }
                let _ = win.center_at_cursor_monitor();
                panel.show_and_make_key();
                // 关键修复：点桌宠（不可聚焦窗口）触发时，光 show_and_make_key 不足以让
                // 面板成为「键盘焦点窗口」——补一个 set_focus 激活 app + 抢键盘焦点，
                // 否则输入会漏到下层应用。⌥Space 路径不受影响（本就已激活）。
                let _ = win.set_focus();
                let _ = app.emit("kunkun-state", serde_json::json!({ "panelOpen": true }));
            }
        }
        Err(e) => eprintln!("[kunkun] 面板转换失败: {e:?}"),
    }
}

/// 拉起 Python 后端（架构文档：spawn venv python，读 stdout 首行握手拿端口+token）
fn spawn_backend(app: &tauri::AppHandle) {
    let backend_dir =
        std::env::var("KUNKUN_BACKEND_DIR").unwrap_or_else(|_| "/Users/mac/Desktop/kunkun".into());
    let python =
        std::env::var("KUNKUN_PYTHON").unwrap_or_else(|_| "/usr/local/bin/python3".into());

    match Command::new(&python)
        .arg("server.py")
        .current_dir(&backend_dir)
        .env("KUNKUN_WATCH_PARENT", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
    {
        Ok(mut child) => {
            let stdout = child.stdout.take();
            *app.state::<AppState>().child.lock().unwrap() = Some(child);
            let handle = app.clone();
            std::thread::spawn(move || {
                let Some(out) = stdout else { return };
                for line in BufReader::new(out).lines().map_while(Result::ok) {
                    if let Some(rest) = line.strip_prefix("KUNKUN_READY ") {
                        // 安全审计 L17：token 不再从 stdout 读，改从 0600 文件读
                        let mut port: u16 = 0;
                        for part in rest.split_whitespace() {
                            if let Some(v) = part.strip_prefix("port=") {
                                port = v.parse().unwrap_or(0);
                            }
                        }
                        // tokenfile 路径可能含空格（如 "Application Support"），取到行尾整段，别按空格拆
                        let token_file = rest
                            .find("tokenfile=")
                            .map(|i| rest[i + "tokenfile=".len()..].trim().to_string())
                            .unwrap_or_default();
                        let token = std::fs::read_to_string(&token_file)
                            .unwrap_or_default()
                            .trim()
                            .to_string();
                        if port > 0 && !token.is_empty() {
                            *handle.state::<AppState>().backend.lock().unwrap() =
                                Some(BackendInfo { port, token });
                            println!("[kunkun] 后端就绪 127.0.0.1:{port}");
                        } else {
                            eprintln!("[kunkun] 握手失败：port={port} 或 token 文件读取失败");
                        }
                        break;
                    }
                }
            });
        }
        Err(e) => eprintln!("[kunkun] 拉起后端失败（检查 python3 路径）: {e}"),
    }
}

fn main() {
    tauri::Builder::default()
        // 单实例锁必须第一个注册（官方要求）：第二次启动 kunkun 时，这个回调在
        // 【已有实例】里触发——不再开新窗口，只把已有桌宠亮出来，然后第二个进程自杀。
        // ⚠️ 关键：回调不在主线程运行，窗口操作必须 run_on_main_thread 调度回主线程，
        //   否则跨线程碰 AppKit/nspanel 会把已有实例也搞崩。这里只做最安全的 show，
        //   不碰 nspanel 面板转换（那个跨线程极易崩）。
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Some(pet) = handle.get_webview_window("pet") {
                    let _ = pet.show();
                    let _ = pet.set_focus();
                }
            });
        }))
        .plugin(tauri_nspanel::init())
        .invoke_handler(tauri::generate_handler![
            get_backend_info,
            toggle_panel,
            hide_panel,
            quit_app
        ])
        .manage(AppState {
            backend: Mutex::new(None),
            child: Mutex::new(None),
            panel_hidden_at: Mutex::new(None),
        })
        .setup(|app| {
            // 菜单栏应用形态：不占 Dock、不进 ⌘Tab
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            spawn_backend(app.handle());

            // 桌宠窗口定位到主屏右下角（Rust 侧一次到位，不依赖前端时序，避免被挪出屏幕）
            if let Some(pet) = app.get_webview_window("pet") {
                if let Ok(Some(monitor)) = pet.primary_monitor() {
                    let scale = monitor.scale_factor();
                    let msize = monitor.size(); // 物理像素
                    let lw = msize.width as f64 / scale; // 逻辑宽
                    let lh = msize.height as f64 / scale; // 逻辑高
                    // 桌宠窗口 470×440（逻辑）；右边留 10、底部留 80（避开 Dock）
                    let x = lw - 470.0 - 10.0;
                    let y = lh - 440.0 - 80.0;
                    match pet.set_position(tauri::LogicalPosition::new(x.max(0.0), y.max(0.0))) {
                        Ok(_) => println!(
                            "[kunkun] 桌宠已定位 → 逻辑({x:.0},{y:.0}) 屏幕({lw:.0}x{lh:.0}) scale={scale}"
                        ),
                        Err(e) => println!("[kunkun] 桌宠定位失败: {e}"),
                    }
                }
                let _ = pet.show();
            }

            // 菜单栏托盘（模板图标随深浅色自适应）
            let open_i = MenuItem::with_id(app, "open", "打开面板（⌥Space）", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出 kunkun", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &quit_i])?;
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
            TrayIconBuilder::with_id("kunkun-tray")
                .icon(icon)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => toggle(app, true),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        // 全局快捷键（Carbon 热键，零 TCC 权限）：
        // 主力 ⌥Space；备用 ⌃⌥Space —— ⌥Space 可能被别的助手类 App 抢注（Carbon 允许多方注册，先到先得）
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["alt+space", "ctrl+alt+space"])
                .expect("快捷键定义失败")
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed
                        && (shortcut.matches(Modifiers::ALT, Code::Space)
                            || shortcut.matches(Modifiers::ALT | Modifiers::CONTROL, Code::Space))
                    {
                        toggle(app, false);
                    }
                })
                .build(),
        )
        .build(tauri::generate_context!())
        .expect("kunkun 启动失败")
        .run(|app, event| {
            // 壳退出 → 杀掉 Python 后端（Rust 侧 spawn 的子进程不会被自动清理）
            if let RunEvent::Exit = event {
                if let Some(mut child) = app.state::<AppState>().child.lock().unwrap().take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
