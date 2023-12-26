"use strict";
//우클릭 방지 해제후 우클릭방지이벤트리스너 기능정지
document.oncontextmenu = function (callback) {
    return true;
};
function callback() {
    document.addEventListener('contextmenu', event => event.preventDefault());
}
