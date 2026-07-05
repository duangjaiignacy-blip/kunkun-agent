// NSPanel 转换（照抄 tauri-macos-spotlight-example v2 分支，tauri-nspanel v2.1 API）
// 关键三件套：nonactivating_panel 样式（不抢焦点）、Floating 层级、全屏辅助 + 跟随活跃空间
use std::time::Instant;

use tauri::{Emitter, Manager, Runtime, WebviewWindow};
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelHandle, PanelLevel, StyleMask,
    WebviewWindowExt as _, // to_panel() 需要此 trait 在作用域内（名字本身不直接引用）
};
use thiserror::Error;

use crate::{AppState, PANEL_LABEL};

tauri_panel! {
    panel!(SpotlightPanel {
        config: {
            can_become_key_window: true,
            is_floating_panel: true,
        }
    })

    panel_event!(SpotlightPanelEventHandler {
        window_did_become_key(notification: &NSNotification) -> (),
        window_did_resign_key(notification: &NSNotification) -> (),
    })
}

type TauriError = tauri::Error;

#[derive(Error, Debug)]
enum Error {
    #[error("窗口转 NSPanel 失败")]
    Panel,
    #[error("找不到面板: {0}")]
    PanelNotFound(String),
    #[error("找不到光标所在显示器")]
    MonitorNotFound,
}

pub trait WebviewWindowExt<R: Runtime> {
    fn to_spotlight_panel(&self) -> tauri::Result<PanelHandle<R>>;
    fn center_at_cursor_monitor(&self) -> tauri::Result<()>;
}

impl<R: Runtime> WebviewWindowExt<R> for WebviewWindow<R> {
    fn to_spotlight_panel(&self) -> tauri::Result<PanelHandle<R>> {
        let panel = self
            .to_panel::<SpotlightPanel<R>>()
            .map_err(|_| TauriError::Anyhow(Error::Panel.into()))?;

        panel.set_level(PanelLevel::Floating.value());

        panel.set_collection_behavior(
            CollectionBehavior::new()
                .full_screen_auxiliary() // 全屏 app 上层也能浮出
                .move_to_active_space() // 跟随当前桌面空间
                .value(),
        );

        // 不激活 app：Spotlight 体验的本质
        panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());

        let handler = SpotlightPanelEventHandler::new();
        handler.window_did_become_key(|_| {
            println!("[kunkun] 面板已获得键盘焦点");
        });
        let app_handle = self.app_handle().clone();
        handler.window_did_resign_key(move |_| {
            println!("[kunkun] 面板失去键盘焦点 → 隐藏");
            // 点击面板外 → 自动隐藏，并记录时刻（防桌宠点击抖动）
            if let Ok(panel) = app_handle.get_webview_panel(PANEL_LABEL) {
                if panel.is_visible() {
                    panel.hide();
                    *app_handle
                        .state::<AppState>()
                        .panel_hidden_at
                        .lock()
                        .unwrap() = Some(Instant::now());
                    let _ = app_handle
                        .emit("kunkun-state", serde_json::json!({ "panelOpen": false }));
                }
            }
        });
        panel.set_event_handler(Some(handler.as_ref()));

        Ok(panel)
    }

    fn center_at_cursor_monitor(&self) -> tauri::Result<()> {
        let monitor = monitor::get_monitor_with_cursor()
            .ok_or(TauriError::Anyhow(Error::MonitorNotFound.into()))?;
        let scale = monitor.scale_factor();
        let m_size = monitor.size().to_logical::<f64>(scale);
        let m_pos = monitor.position().to_logical::<f64>(scale);

        let panel = self
            .get_webview_panel(self.label())
            .map_err(|_| TauriError::Anyhow(Error::PanelNotFound(self.label().into()).into()))?;
        let panel = panel.as_panel();
        let frame = panel.frame();

        // 水平居中，垂直放在屏幕上 1/4 处（Spotlight 习惯位）
        let rect = NSRect {
            origin: NSPoint {
                x: (m_pos.x + m_size.width / 2.0) - frame.size.width / 2.0,
                y: (m_pos.y + m_size.height * 0.72) - frame.size.height / 2.0,
            },
            size: frame.size,
        };
        panel.setFrame_display(rect, true);
        Ok(())
    }
}
