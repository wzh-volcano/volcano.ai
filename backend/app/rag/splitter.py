"""文本切分器：支持多种分段策略。

策略：
- general_auto:   递归字符分割（自动检测段落）
- general_custom:  递归字符分割（用户指定分隔符）
- markdown_header: 按 Markdown 标题层级切分，标题作为前缀
- parent_child:   父子两层结构，检索命中子块返回父块
"""
from __future__ import annotations

from langchain_core.documents import Document
from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)

# ---------- 默认分隔符 ----------
_DEFAULT_SEPARATORS = ["\n\n", "\n", "。", "！", "？", ".", "!", "?", " ", ""]


# ---------- 通用-自动 ----------
def _general_auto(
    documents: list[Document], chunk_size: int, chunk_overlap: int
) -> list[Document]:
    """递归字符切分，自动按段落/句子切分。"""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=_DEFAULT_SEPARATORS,
    )
    return splitter.split_documents(documents)


# ---------- 通用-自定义 ----------
def _general_custom(
    documents: list[Document],
    chunk_size: int,
    chunk_overlap: int,
    separators: list[str] | None = None,
) -> list[Document]:
    """递归字符切分，使用用户自定义分隔符。"""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=separators or _DEFAULT_SEPARATORS,
    )
    return splitter.split_documents(documents)


# ---------- Markdown 标题分段 ----------
def _markdown_header(
    documents: list[Document], chunk_size: int, chunk_overlap: int
) -> list[Document]:
    """按 Markdown 标题层级切分，标题作为内容前缀保留上下文。"""
    headers_to_split_on = [
        ("#", "Header 1"),
        ("##", "Header 2"),
        ("###", "Header 3"),
        ("####", "Header 4"),
    ]
    md_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers_to_split_on)
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", "。", ".", " ", ""],
    )

    result: list[Document] = []
    for doc in documents:
        # 先按标题切
        md_chunks = md_splitter.split_text(doc.page_content)
        # 再对超长块做二次切分
        for chunk in md_chunks:
            # 将标题元数据作为前缀拼入内容，保持上下文完整
            header_prefix = _build_header_prefix(chunk.metadata)
            full_content = header_prefix + chunk.page_content if header_prefix else chunk.page_content

            if len(full_content) <= chunk_size:
                result.append(
                    Document(page_content=full_content, metadata=doc.metadata)
                )
            else:
                # 超长块再做字符切分
                sub_chunks = text_splitter.split_text(full_content)
                for sub in sub_chunks:
                    result.append(
                        Document(page_content=sub, metadata=doc.metadata)
                    )
    return result


def _build_header_prefix(metadata: dict) -> str:
    """将 Markdown 标题元数据拼接成前缀字符串。"""
    parts: list[str] = []
    for key in sorted(metadata):
        val = metadata.get(key)
        if val:
            # Header 1 → "#", Header 2 → "##", ...
            level = key.replace("Header ", "")
            parts.append(f"{'#' * int(level)} {val}")
    if parts:
        return "\n".join(parts) + "\n\n"
    return ""


# ---------- 父子分段 ----------
def _parent_child(
    documents: list[Document],
    chunk_size: int,
    chunk_overlap: int,
    parent_chunk_size: int = 2000,
) -> list[Document]:
    """父子两层分段。

    先用 parent_chunk_size 切出父块，再对每个父块用 chunk_size 切出子块。
    子块的 metadata 中标记 parent_index 用于后续存储时关联父块。
    """
    parent_splitter = RecursiveCharacterTextSplitter(
        chunk_size=parent_chunk_size,
        chunk_overlap=chunk_overlap,  # 父块之间可以有一定重叠
        separators=["\n\n", "\n", "。", ".", " ", ""],
    )
    child_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=_DEFAULT_SEPARATORS,
    )

    result: list[Document] = []
    for doc in documents:
        parent_chunks = parent_splitter.split_documents([doc])

        for p_idx, parent in enumerate(parent_chunks):
            # 父块本身也加入结果（带 parent_index=-1 标记为父块）
            parent.metadata["chunk_role"] = "parent"
            parent.metadata["parent_index"] = p_idx
            result.append(parent)

            # 子块
            child_chunks = child_splitter.split_documents([parent])
            for child in child_chunks:
                child.metadata["chunk_role"] = "child"
                child.metadata["parent_index"] = p_idx
                result.append(child)

    return result


# ---------- 调度入口 ----------
def split_documents(
    documents: list[Document],
    method: str = "general_auto",
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    **kwargs,
) -> list[Document]:
    """根据 method 调用对应的切分策略。

    Args:
        documents: 待切分的文档列表。
        method: 切分方法标识（general_auto / general_custom / markdown_header / parent_child）。
        chunk_size: 子块最大长度。
        chunk_overlap: 块间重叠长度。
        **kwargs:
            separators: list[str] — 仅 general_custom 使用。
            parent_chunk_size: int — 仅 parent_child 使用。

    Returns:
        切分后的 Document 列表。
    """
    if method == "general_custom":
        return _general_custom(
            documents, chunk_size, chunk_overlap,
            separators=kwargs.get("separators"),
        )
    if method == "markdown_header":
        return _markdown_header(documents, chunk_size, chunk_overlap)
    if method == "parent_child":
        return _parent_child(
            documents, chunk_size, chunk_overlap,
            parent_chunk_size=kwargs.get("parent_chunk_size", 2000),
        )
    # 默认 general_auto
    return _general_auto(documents, chunk_size, chunk_overlap)
