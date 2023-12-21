let data = [
  { tabname: "11", link: "11", active: "11" },
  { tabname: "22", link: "22", active: "22" },
  { tabname: "33", link: "33", active: "33" },
];
function makelist() {
  var tableBody = $("#linklist tbody");
  tableBody.empty(); // Clear existing rows
  // Loop through the data and append rows to the table
  $.each(data, function (index, item) {
    var row = $("<tr>");
    row.append($("<td>").text(index));
    row.append($("<td>").text(item.tabname));
    row.append($("<td>").text(item.link));
    row.append($("<td>").text(item.active));
    tableBody.append(row);
  });
}
makelist();
