# Feature Specification: SFTP File Manager

**Feature Branch**: `004-sftp-file-manager`

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "像腾讯云控制台远程登录服务器那样添加一个文件管理器，出一个方案"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse Server Files (Priority: P1)

An operator connects to an SSH asset, opens the file manager panel alongside the terminal, and browses the remote server's file system with a familiar directory tree and file list view.

**Why this priority**: File browsing is the foundation — without it, no other file operations can happen.

**Independent Test**: Connect SSH → click "文件管理" → see directory listing of home folder → click into subdirectories → navigate back.

**Acceptance Scenarios**:

1. **Given** an active SSH connection, **When** the user clicks "文件管理" in the terminal toolbar, **Then** a split-panel appears showing the remote file system with current directory contents.
2. **Given** the file manager is open, **When** the user double-clicks a directory, **Then** the view navigates into that directory and lists its contents.
3. **Given** the file manager shows a subdirectory, **When** the user clicks the breadcrumb or ".." (parent), **Then** the view returns to the parent directory.
4. **Given** the file manager, **When** the user types a path in the address bar and presses Enter, **Then** the view navigates to that path.

---

### User Story 2 - Upload & Download Files (Priority: P1)

An operator uploads files from their local machine to the remote server, or downloads files from the server to their local machine, through the file manager interface.

**Why this priority**: File transfer is the primary reason for needing a file manager alongside a terminal.

**Independent Test**: Open file manager → click "上传" → select a local file → file appears in current directory. Right-click a file → click "下载" → file downloads to local machine.

**Acceptance Scenarios**:

1. **Given** the file manager, **When** the user clicks "上传文件" and selects a local file, **Then** the file is uploaded to the current remote directory with a progress indicator.
2. **Given** the file manager shows a file, **When** the user clicks the download icon on that file, **Then** the file is downloaded to the local machine.
3. **Given** a large file upload (>10MB), **When** the upload is in progress, **Then** a progress bar shows percentage complete and estimated time remaining.
4. **Given** an upload is in progress, **When** the user clicks "取消", **Then** the upload stops and the partial file is removed.

---

### User Story 3 - File Operations (Priority: P2)

An operator performs basic file operations — rename, delete, create folder, change permissions — directly from the file manager.

**Why this priority**: These are common day-to-day operations that save time compared to typing commands.

**Independent Test**: Right-click a file → rename → verify new name. Select a file → delete → confirm → file removed. Click "新建文件夹" → enter name → folder created.

**Acceptance Scenarios**:

1. **Given** a file is selected, **When** the user clicks "重命名" and enters a new name, **Then** the file is renamed and the list refreshes.
2. **Given** a file is selected, **When** the user clicks "删除" and confirms, **Then** the file is deleted and removed from the list.
3. **Given** the file manager, **When** the user clicks "新建文件夹" and enters a name, **Then** a new empty directory is created.
4. **Given** a file is selected, **When** the user changes permissions via the "权限" dialog, **Then** the file's permissions are updated (e.g., 0755 → 0644).

---

### User Story 4 - File Preview & Editing (Priority: P3)

An operator previews the content of text files (logs, configs, scripts) directly in the browser, and optionally edits small configuration files.

**Why this priority**: Quick preview without downloading saves significant time for troubleshooting and log analysis.

**Independent Test**: Double-click a .log file → content displays in preview panel. Click "编辑" on a .conf file → edit content → save → file updated on server.

**Acceptance Scenarios**:

1. **Given** the file manager, **When** the user clicks a text file (<500KB), **Then** the file content is displayed in a read-only preview panel with syntax highlighting by extension.
2. **Given** a text file is being previewed, **When** the user clicks "编辑", **Then** the panel switches to edit mode with a text editor.
3. **Given** the edit mode, **When** the user modifies content and clicks "保存", **Then** the file is written back to the remote server.

---

### User Story 5 - RDP File Upload & Download (Priority: P2)

An operator using RDP can upload files from their local machine to the remote Windows desktop, and download files from the remote desktop, without needing a separate file manager.

**Why this priority**: RDP users need file transfer too, but the full file manager experience is not feasible over Guacamole. Simple upload/download via Guacamole's drive redirection covers 80% of use cases.

**Independent Test**: Connect RDP → click "上传文件" → select local file → file appears in the remote desktop's designated transfer folder. Copy a file to the transfer folder in Windows → click "下载" → file downloads to local machine.

**Acceptance Scenarios**:

1. **Given** an active RDP connection, **When** the user clicks "上传文件" and selects a local file, **Then** the file is transferred via Guacamole stream and appears in `C:\Transfer\` on the remote Windows desktop.
2. **Given** a file placed in `C:\Transfer\` on the remote desktop, **When** the user clicks "下载文件" and selects the file from the list, **Then** the file is transferred from the remote desktop to the local machine.
3. **Given** a file upload is in progress, **When** the upload completes, **Then** a notification appears on the RDP toolbar.

---

### Edge Cases

- What happens when a user tries to access a directory without read permission? Display "权限不足" with the path.
- What happens when a file upload conflicts with an existing file? Prompt the user: "覆盖 / 跳过 / 重命名".
- What happens when the SSH connection drops during a file transfer? The transfer is cancelled and the user is notified.
- What happens with very large directories (>10,000 files)? Paginate results, show first 200 entries with a warning.
- What happens when a file name contains non-UTF-8 characters? Display as-is; operations may fail and show an error.
- What happens with symlinks? Show them with a link icon; operations on broken links show an error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a file browser UI accessible from the SSH terminal toolbar that lists remote files and directories.
- **FR-002**: System MUST support navigating into subdirectories and returning to parent directories.
- **FR-003**: System MUST display file metadata: name, size (human-readable), permissions, owner, and modification time.
- **FR-004**: System MUST support file upload from the local machine to the remote server via drag-and-drop and file picker.
- **FR-005**: System MUST support file download from the remote server to the local machine.
- **FR-006**: System MUST support creating new directories on the remote server.
- **FR-007**: System MUST support renaming files and directories on the remote server.
- **FR-008**: System MUST support deleting files and directories (with confirmation) on the remote server.
- **FR-009**: System MUST show a progress indicator for upload and download operations.
- **FR-010**: System MUST reuse the existing SSH connection's authentication (no separate login required).
- **FR-011**: System MUST display a breadcrumb navigation bar showing the current path.
- **FR-012**: System MUST support file preview for common text files (<500KB) with syntax highlighting.
- **FR-013**: System MUST support in-browser editing of text files with save functionality.
- **FR-014**: System MUST log all file operations (upload, download, delete, rename) to the audit trail.
- **FR-015**: System MUST support file upload to RDP sessions via Guacamole drive redirection, with files appearing in a designated transfer folder on the remote desktop.
- **FR-016**: System MUST support file download from RDP sessions by listing files in the designated transfer folder and serving them to the browser.

### Key Entities

- **SftpSession**: An SFTP channel multiplexed over the existing SSH connection. Tied to a single SSH session. Contains: session_id, connected status, current working directory.
- **RemoteFile**: A file or directory on the remote server. Attributes: name, path, size, permissions, owner, group, mtime, is_directory, is_symlink.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can navigate into a subdirectory and see file listings within 2 seconds.
- **SC-002**: File upload and download show progress updates at least once per second.
- **SC-003**: Text file preview (<500KB) displays within 3 seconds of clicking the file.
- **SC-004**: 100% of file operations (upload, download, delete, rename) are recorded in the audit log.
- **SC-005**: Directory listing handles up to 5,000 files without noticeable UI lag (<500ms render time).

## Assumptions

- SFTP is supported by the SSH2 library already used for terminal connections.
- The file manager operates over the same SSH connection as the terminal — no separate authentication.
- SSH file manager provides full browse/upload/download/edit capabilities via SFTP.
- RDP file transfer provides upload/download only via Guacamole drive redirection, requiring guacd `drive-path` configuration. The remote Windows machine needs the designated transfer folder accessible.
- File preview/edit is limited to text files under 500KB. Binary files are download-only.
- Upload is limited to 100MB per file by default (configurable).
- The file manager UI shares screen space with the terminal (split-panel or tabbed layout).
