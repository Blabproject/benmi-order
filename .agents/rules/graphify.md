---
trigger: always_on
description: MANDATORY Graph-First rule: Always consult graphify before any code search, investigation, or debugging.
---

## graphify (MANDATORY Graph-First Hard Gate)

This project has a graphify knowledge graph at graphify-out/.

### Strict Pre-Flight Rules (CỔNG CHẶN BẮT BUỘC):
1. **CẤM GREP MÒ MẪM (Zero Blind Grepping)**: 
   - Khi `graphify-out/graph.json` tồn tại, **TUYỆT ĐỐI CẤM** chạy `grep`, `rg`, hoặc `find` tràn lan qua các thư mục (`js/*.js`, `benmi-worker-official/src/`...) để tìm mã nguồn hay điều tra bug.
   - **BẮT BUỘC**: Lệnh khám phá đầu tiên (Step 0) phải luôn là `graphify query "<tính năng/màn hình/lỗi>"` hoặc `graphify explain "<symbol>"`.
2. **Quy trình Điều tra 3 Bước Chuẩn**:
   - **Bước 1 (Graph Discovery)**: Dùng `graphify query` hoặc `graphify explain` để trích xuất subgraph hẹp, lấy đúng file name và số dòng (`loc=L...`).
   - **Bước 2 (Targeted Read)**: Chỉ dùng `read_file` đúng dải dòng mà Graphify đã định vị chính xác (tiết kiệm token và ngữ cảnh).
   - **Bước 3 (AST Sync)**: Sau khi hoàn tất sửa code, BẮT BUỘC chạy `graphify update .` để giữ đồ thị AST luôn tươi mới (miễn phí, không tốn LLM API).
3. **Tra cứu Quan Hệ & Khái Niệm**:
   - Dùng `graphify path "<A>" "<B>"` để xem chuỗi gọi hàm giữa 2 module.
   - Dùng `graphify explain "<tên_hàm/lớp>"` để xem toàn bộ caller và callee của hàm đó.
4. **Wiki & Báo Cáo**:
   - Nếu `graphify-out/wiki/index.md` tồn tại, đọc nó thay vì đọc file thô.
   - Chỉ đọc `graphify-out/GRAPH_REPORT.md` khi cần cái nhìn toàn cảnh hệ thống cấp cao.
