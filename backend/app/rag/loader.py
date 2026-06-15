"""文档加载器：按扩展名选择合适的 LangChain Loader。"""
from pathlib import Path

from langchain_core.documents import Document


def load_file(path: Path) -> list[Document]:
    """根据扩展名解析文件，返回 LangChain Document 列表。"""
    suffix = path.suffix.lower()
    text = path.read_text(encoding="utf-8", errors="ignore")
    source = path.name

    if suffix == ".pdf":
        from langchain_community.document_loaders import PyPDFLoader

        return PyPDFLoader(str(path)).load()

    if suffix in (".docx", ".doc"):
        from langchain_community.document_loaders import Docx2txtLoader

        return Docx2txtLoader(str(path)).load()

    if suffix in (".md", ".markdown"):
        # 保留元数据，直接读文本
        return [Document(page_content=text, metadata={"source": source})]

    if suffix == ".csv":
        from langchain_community.document_loaders.csv_loader import CSVLoader

        return CSVLoader(str(path)).load()

    if suffix in (".html", ".htm"):
        from langchain_community.document_loaders import UnstructuredHTMLLoader

        return UnstructuredHTMLLoader(str(path)).load()

    # txt / other：按纯文本
    return [Document(page_content=text, metadata={"source": source})]
