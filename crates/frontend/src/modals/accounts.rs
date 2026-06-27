use bridge::{handle::BackendHandle, message::MessageToBackend};
use gpui::{prelude::FluentBuilder, *};
use gpui_component::{
    ActiveTheme, Disableable, WindowExt, button::{Button, ButtonVariants}, h_flex, input::{Input, InputState}, sheet::Sheet, v_flex,
};
use rand::Rng;
use uuid::Uuid;

use crate::{component::shrinking_text::ShrinkingText, entity::{DataEntities, account::{AccountEntries, AccountExt}}, icon::PandoraIcon, interface_config::InterfaceConfig, png_render_cache};

#[derive(Clone)]
struct AccountDragInfo {
    index: usize,
    name: SharedString,
}

struct AccountDragPreview {
    name: SharedString,
    position: Point<Pixels>,
}

impl Render for AccountDragPreview {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let size = size(px(180.0), px(44.0));

        div()
            .pl(self.position.x - size.width.half())
            .pt(self.position.y - size.height.half())
            .child(
                h_flex()
                    .w(size.width)
                    .h(size.height)
                    .px_3()
                    .gap_2()
                    .rounded(cx.theme().radius)
                    .border_1()
                    .border_color(cx.theme().border)
                    .bg(cx.theme().popover)
                    .text_color(cx.theme().popover_foreground)
                    .shadow_lg()
                    .child(PandoraIcon::GripVertical)
                    .child(ShrinkingText::new(self.name.clone())),
            )
    }
}

struct Accounts {
    backend_handle: BackendHandle,
    accounts: Entity<AccountEntries>,
}

pub fn build_accounts_sheet(data: &DataEntities, window: &mut Window, cx: &mut App) -> impl Fn(Sheet, &mut Window, &mut App) -> Sheet + 'static {
    let accounts = cx.new(|cx| {
        let accounts = Accounts {
            backend_handle: data.backend_handle.clone(),
            accounts: data.accounts.clone(),
        };

        accounts
    });

    move |sheet, _, cx| {
        sheet
            .title(t::account::title())
            .size(px(420.))
            .when(cfg!(target_os = "macos"), |this| this.pt_5())
            .child(accounts.clone())
    }
}

impl Render for Accounts {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let hide_skins = InterfaceConfig::get(cx).hide_skins;

        let (accounts, selected_account) = {
            let accounts = self.accounts.read(cx);
            (accounts.accounts.clone(), accounts.selected_account_uuid)
        };

        let accounts_len = accounts.len();
        let items = accounts.iter().enumerate().map(|(account_index, account)| {
            let head = if hide_skins {
                gpui::img(ImageSource::Resource(Resource::Embedded("images/hidden_head.png".into())))
            } else if let Some(head) = &account.head {
                let resize = png_render_cache::ImageTransformation::Resize { width: 32, height: 32 };
                png_render_cache::render_with_transform(head.clone(), resize, cx)
            } else {
                gpui::img(ImageSource::Resource(Resource::Embedded("images/default_head.png".into())))
            };
            let account_name = account.username(InterfaceConfig::get(cx).hide_usernames);

            let selected = Some(account.uuid) == selected_account;
            let group_name: SharedString = format!("account-row-{account_index}").into();
            let uuid = account.uuid;
            let drag_info = AccountDragInfo {
                index: account_index,
                name: account_name.clone(),
            };
            let row_bg = if selected {
                cx.theme().info.opacity(0.15)
            } else {
                cx.theme().input_background()
            };
            let row_border = if selected {
                cx.theme().info
            } else {
                cx.theme().border.opacity(0.55)
            };

            h_flex()
                .id(("account-row", account_index))
                .group(group_name.clone())
                .w_full()
                .h(px(56.0))
                .px_3()
                .gap_3()
                .rounded(cx.theme().radius)
                .border_1()
                .border_color(row_border)
                .bg(row_bg)
                .text_size(rems(0.9375))
                .line_height(rems(1.0))
                .cursor_move()
                .hover(|style| {
                    style
                        .bg(cx.theme().secondary_hover)
                        .border_color(cx.theme().info.opacity(0.75))
                })
                .on_drag(drag_info, |info: &AccountDragInfo, position, _, cx| {
                    cx.new(|_| AccountDragPreview {
                        name: info.name.clone(),
                        position,
                    })
                })
                .on_drop({
                    let backend_handle = self.backend_handle.clone();
                    move |drag: &AccountDragInfo, _, _| {
                        if drag.index != account_index {
                            backend_handle.send(MessageToBackend::ReorderAccounts {
                                from_index: drag.index,
                                to_index: account_index,
                            });
                        }
                    }
                })
                .when(!selected, |this| {
                    this.on_click({
                        let backend_handle = self.backend_handle.clone();
                        move |_, _, _| {
                            backend_handle.send(MessageToBackend::SelectAccount { uuid });
                        }
                    })
                })
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_center()
                        .size_6()
                        .min_w_6()
                        .text_color(cx.theme().muted_foreground)
                        .opacity(0.65)
                        .group_hover(group_name.clone(), |style| {
                            style.opacity(1.0).text_color(cx.theme().foreground)
                        })
                        .child(PandoraIcon::GripVertical),
                )
                .child(head.size_8().min_w_8().min_h_8())
                .child(
                    div()
                        .min_w_0()
                        .flex_1()
                        .font_weight(if selected { FontWeight::MEDIUM } else { FontWeight::NORMAL })
                        .text_color(if selected { cx.theme().info } else { cx.theme().foreground })
                        .child(ShrinkingText::new(account_name.clone())),
                )
                .child(
                    h_flex()
                        .gap_1()
                        .invisible()
                        .group_hover(group_name.clone(), |style| style.visible())
                        .child(Button::new(("account-up", account_index))
                            .ghost()
                            .compact()
                            .h_8()
                            .w_8()
                            .icon(PandoraIcon::ArrowUp)
                            .disabled(account_index == 0)
                            .on_click({
                                let backend_handle = self.backend_handle.clone();
                                move |_, _, cx| {
                                    cx.stop_propagation();
                                    if account_index == 0 {
                                        return;
                                    }
                                    backend_handle.send(MessageToBackend::ReorderAccounts {
                                        from_index: account_index,
                                        to_index: account_index - 1,
                                    });
                                }
                            }))
                        .child(Button::new(("account-down", account_index))
                            .ghost()
                            .compact()
                            .h_8()
                            .w_8()
                            .icon(PandoraIcon::ArrowDown)
                            .disabled(account_index + 1 >= accounts_len)
                            .on_click({
                                let backend_handle = self.backend_handle.clone();
                                move |_, _, cx| {
                                    cx.stop_propagation();
                                    if account_index + 1 >= accounts_len {
                                        return;
                                    }
                                    backend_handle.send(MessageToBackend::ReorderAccounts {
                                        from_index: account_index,
                                        to_index: account_index + 1,
                                    });
                                }
                            }))
                        .child(Button::new(("account-delete", account_index))
                            .ghost()
                            .compact()
                            .icon(PandoraIcon::Trash2)
                            .h_8()
                            .w_8()
                            .danger()
                            .on_click({
                                let backend_handle = self.backend_handle.clone();
                                move |_, _, cx| {
                                    cx.stop_propagation();
                                    backend_handle.send(MessageToBackend::DeleteAccount { uuid });
                                }
                            })),
                )

        });

        v_flex()
            .gap_2()
            .child(Button::new("add-account").h_10().success().icon(PandoraIcon::Plus).label(t::account::add::label()).on_click({
                let backend_handle = self.backend_handle.clone();
                move |_, window, cx| {
                    crate::root::start_new_account_login(&backend_handle, window, cx);
                }
            }))
            .child(Button::new("add-offline").h_10().success().icon(PandoraIcon::Plus).label(t::account::add::offline()).on_click({
                let backend_handle = self.backend_handle.clone();
                move |_, window, cx| {
                    let name_input = cx.new(|cx| {
                        InputState::new(window, cx)
                    });
                    let uuid_input = cx.new(|cx| {
                        InputState::new(window, cx).placeholder(t::account::uuid_random())
                    });
                    let backend_handle = backend_handle.clone();
                    window.open_dialog(cx, move |dialog, _, cx| {
                        let username = name_input.read(cx).value();
                        let valid_name = username.len() >= 1 && username.len() <= 16 &&
                            username.as_bytes().iter().all(|c| *c > 32 && *c < 127);
                        let uuid = uuid_input.read(cx).value();
                        let valid_uuid = uuid.is_empty() || Uuid::try_parse(&uuid).is_ok();

                        let valid = valid_name && valid_uuid;

                        let backend_handle = backend_handle.clone();
                        let mut add_button = Button::new("add").label(t::account::add::submit()).disabled(!valid).on_click(move |_, window, cx| {
                            window.close_all_dialogs(cx);

                            let uuid = if let Ok(uuid) = Uuid::try_parse(&uuid) {
                               uuid
                            } else {
                                let uuid: u128 = rand::thread_rng().r#gen();
                                let uuid = (uuid & !0xF0000000000000000000) | 0x30000000000000000000; // set version to 3
                                Uuid::from_u128(uuid)
                            };

                            backend_handle.send(MessageToBackend::AddOfflineAccount {
                                name: username.clone().into(),
                                uuid
                            });
                        });

                        if valid {
                            add_button = add_button.success();
                        }

                        dialog.title(t::account::add::offline())
                            .child(v_flex()
                                .gap_2()
                                .child(crate::labelled(t::account::name(), Input::new(&name_input)))
                                .child(crate::labelled(t::account::uuid(), Input::new(&uuid_input)))
                                .child(add_button)
                            )
                    });
                }
            }))
            .children(items)
    }
}
