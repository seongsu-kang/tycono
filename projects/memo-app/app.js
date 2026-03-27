// DOM 요소
const memoInput = document.getElementById('memoInput');
const addBtn = document.getElementById('addBtn');
const memoList = document.getElementById('memoList');
const emptyState = document.getElementById('emptyState');

// localStorage 키
const STORAGE_KEY = 'memos';

// 메모 배열
let memos = [];

// 초기화
function init() {
    loadMemos();
    renderMemos();
    attachEventListeners();
}

// localStorage에서 메모 불러오기
function loadMemos() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            memos = JSON.parse(stored);
        } catch (error) {
            console.error('메모 불러오기 실패:', error);
            memos = [];
        }
    }
}

// localStorage에 메모 저장
function saveMemos() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memos));
}

// 메모 추가
function addMemo() {
    const text = memoInput.value.trim();

    if (!text) {
        memoInput.focus();
        return;
    }

    const memo = {
        id: Date.now(),
        text: text,
        createdAt: new Date().toISOString()
    };

    memos.unshift(memo);
    saveMemos();
    renderMemos();

    memoInput.value = '';
    memoInput.focus();
}

// 메모 삭제
function deleteMemo(id) {
    memos = memos.filter(memo => memo.id !== id);
    saveMemos();
    renderMemos();
}

// 메모 렌더링
function renderMemos() {
    memoList.innerHTML = '';

    if (memos.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    memos.forEach(memo => {
        const memoItem = document.createElement('div');
        memoItem.className = 'memo-item';

        const memoText = document.createElement('div');
        memoText.className = 'memo-text';
        memoText.textContent = memo.text;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '삭제';
        deleteBtn.onclick = () => deleteMemo(memo.id);

        memoItem.appendChild(memoText);
        memoItem.appendChild(deleteBtn);
        memoList.appendChild(memoItem);
    });
}

// 이벤트 리스너 등록
function attachEventListeners() {
    addBtn.addEventListener('click', addMemo);

    memoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addMemo();
        }
    });
}

// 앱 시작
init();
