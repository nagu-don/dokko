import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import axios from 'axios';
import './Add.css';
import editIconImg from '../../assets/edit-icon.png';
import { getAuthHeaders, isAuthError } from '../../utils/api';
import { matchesQuery, sortRows } from '../../utils/searchSort';
import SearchSort from '../../components/SearchSort/SearchSort';
import Pagination from '../../components/Pagination/Pagination';

// 10 items per page on the admin items page
const ITEMS_PER_PAGE = 10;

// sortable parameters for items
const ITEM_SORT_FIELDS = {
  nameEng:  { label: 'Name (English)', get: (i) => i.nameEng },
  nameNep:  { label: 'Name (Nepali)',  get: (i) => i.nameNep },
  minPrice: { label: 'Min price', type: 'number', get: (i) => i.minPrice },
  avgPrice: { label: 'Avg price', type: 'number', get: (i) => i.avgPrice },
  maxPrice: { label: 'Max price', type: 'number', get: (i) => i.maxPrice },
  approved: { label: 'Approved', get: (i) => i.status },
  available:{ label: 'Available', get: (i) => i.available },
};

const ITEM_SORT_OPTIONS = Object.entries(ITEM_SORT_FIELDS)
  .map(([key, f]) => ({ key, label: f.label }));

// every value an item can be searched by
const itemSearchValues = (item) => [
  item.nameEng,
  item.nameNep,
  item.minPrice,
  item.avgPrice,
  item.maxPrice,
  item.status ? 'approved' : 'pending unapproved',
  item.available ? 'available in stock' : 'unavailable out of stock',
];

const Add = ({ url }) => {
  const [list, setList] = useState([]);

  const [editingId, setEditingId] = useState(null);
  const [activeField, setActiveField] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [imageFile, setImageFile] = useState(null);

  // search + sort controls
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'nameEng', dir: 'asc' });
  const [page, setPage] = useState(1);

  // new search or sort order -> back to the first page
  useEffect(() => {
    setPage(1);
  }, [query, sort]);

  const fetchList = async () => {
    try {
      const response = await axios.get(`${url}/api/items/list`);
      if (response.data.success) {
        setList(response.data.data);
      } else {
        toast.error('Error');
      }
    } catch (error) {
      console.error("FETCH ERROR:", error);
      toast.error("Failed to fetch items");
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleEdit = (id) => {
    setEditingId(id);
    const item = list.find((item) => item._id === id);

    if (item) {
      setEditValues({
        nameEng: item.nameEng,
        nameNep: item.nameNep,
        minPrice: item.minPrice,
        avgPrice: item.avgPrice,
        maxPrice: item.maxPrice,
        image: item.image,
      });
    }
  };

  const handleDiscard = () => {
    setEditingId(null);
    setActiveField(null);
    setEditValues({});
    setImageFile(null);
  };

  function changeEditIcon(id, field) {
    if (editingId === id) {
      return (
        <button
          className="edit-button-image"
          onClick={() => changeHandler(id, field)}
        >
          <img src={editIconImg} className="edit-image" alt="Edit" />
        </button>
      );
    }
    return null;
  }

  function changeHandler(id, field) {
    setActiveField(field);
  }

  const handleConfirm = async (id) => {

      try {

          const formData = new FormData();

          formData.append(
              "nameEng",
              editValues.nameEng
          );

          formData.append(
              "nameNep",
              editValues.nameNep
          );

          formData.append(
              "minPrice",
              editValues.minPrice
          );

          formData.append(
              "avgPrice",
              editValues.avgPrice
          );

          formData.append(
              "maxPrice",
              editValues.maxPrice
          );

          if (imageFile) {
              formData.append(
                  "image",
                  imageFile
              );
          }

          const response = await axios.patch(
              `${url}/api/items/edit/${id}`,
              formData,
              { headers: getAuthHeaders() }
          );

          if (response.data.success) {

              const updatedItem = response.data.data;

              setList((prevList) =>
                  prevList.map((item) =>
                      item._id === id
                          ? updatedItem
                          : item
                  )
              );

              toast.success(
                  "Item updated successfully"
              );

              handleDiscard();

          } else {

              toast.error(
                  "Failed to update item"
              );
          }

      } catch (error) {

          console.error(
              "UPDATE ERROR:",
              error
          );

          if (isAuthError(error)) {
              toast.error("Please log in as an admin to edit items");
          } else {
              toast.error("Error updating item");
          }
      }
  };

  const approveItem = async (id) => {
    try {
      const response = await axios.patch(`${url}/api/items/approve/${id}`, null, {
        headers: getAuthHeaders(),
      });
      if (response.data.success) {
        const updatedItem = response.data.data;
        setList((previousList) =>
          previousList.map((item) =>
            item._id === id ? { ...item, status: updatedItem.status } : item
          )
        );
      } else {
        toast.error(response.data.message || "Failed to update approval");
      }
    } catch (error) {
      console.error("APPROVE ERROR:", error);
      if (isAuthError(error)) {
        toast.error("Please log in as an admin to approve items");
      } else {
        toast.error("Failed to update approval");
      }
    }
  };

  const handleInputChange = (field, value) => {
    setEditValues((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setImageFile(file);
  };

  const renderFieldEditor = (item, field) => {
    if (editingId !== item._id || activeField !== field) {
      return null;
    }

    if (field === "image") {
      return (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10
        }}>
          <label style={{
            cursor: 'pointer',
            backgroundColor: 'white',
            border: '1px solid #777',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            color: 'black'
          }}>
            Choose File
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      );
    }

    if (field === "nameEng" || field === "nameNep") {
      return (
        <input
          type="text"
          autoFocus
          value={editValues[field] ?? ""}
          onChange={(e) => handleInputChange(field, e.target.value)}
          onFocus={(e) => e.target.select()}
          className="field-input"
        />
      );
    }

    if (
      field === "minPrice" ||
      field === "avgPrice" ||
      field === "maxPrice"
    ) {
      return (
        <input
          type="number"
          step="any"
          value={editValues[field] ?? ""}
          onChange={(e) => handleInputChange(field, e.target.value)}
          className="field-input"
        />
      );
    }
    return null;
  };

  // search + sort across everything, then paginate the combined list
  const visible = sortRows(
    list.filter((item) => matchesQuery(query, itemSearchValues(item))),
    sort.key,
    sort.dir,
    ITEM_SORT_FIELDS
  );

  // existing first, then new — same order as before, one continuous list
  const orderedItems = [
    ...visible.filter((item) => item.nameEng !== item.nameNep),
    ...visible.filter((item) => item.nameEng === item.nameNep),
  ];

  const totalPages = Math.max(1, Math.ceil(orderedItems.length / ITEMS_PER_PAGE));

  // clamp instead of state-juggling if the list shrinks below the current page
  const currentPage = Math.min(page, totalPages);

  const goToPage = (p) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pageItems = orderedItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const existingItems = pageItems.filter((item) => item.nameEng !== item.nameNep);
  const newItems = pageItems.filter((item) => item.nameEng === item.nameNep);

  const renderItem = (item) => (
      <div className="item-container" key={item._id}>

          <div
              className="image-container"
              style={{ position: 'relative' }}
          >
              <img
                  src={
                      editingId === item._id && imageFile
                          ? URL.createObjectURL(imageFile)
                          : `${url}/images/` + item.image
                  }
                  className="item-image"
                  alt={item.nameEng}
              />

              {changeEditIcon(item._id, "image")}
              {renderFieldEditor(item, "image")}
          </div>

          <div className="item-text">

              <div className="name-row">

                  <div className="field-container">

                      {activeField === "nameEng" &&
                      editingId === item._id ? (
                          renderFieldEditor(item, "nameEng")
                      ) : (
                          <h4>
                              {editingId === item._id
                                  ? editValues.nameEng
                                  : item.nameEng}
                          </h4>
                      )}

                      {changeEditIcon(item._id, "nameEng")}

                  </div>

                  <div className="field-container">

                      {activeField === "nameNep" &&
                      editingId === item._id ? (
                          renderFieldEditor(item, "nameNep")
                      ) : (
                          <h4>
                              {editingId === item._id
                                  ? editValues.nameNep
                                  : item.nameNep}
                          </h4>
                      )}

                      {changeEditIcon(item._id, "nameNep")}

                  </div>

              </div>

              <div className="price">

                  <div>Prices:</div>

                  <div className="field-container">

                      {activeField === "minPrice" &&
                      editingId === item._id ? (
                          renderFieldEditor(item, "minPrice")
                      ) : (
                          <span>
                              Min: Rs.{" "}
                              {editingId === item._id
                                  ? editValues.minPrice
                                  : item.minPrice}
                          </span>
                      )}

                      {changeEditIcon(item._id, "minPrice")}

                  </div>

                  <div className="field-container">

                      {activeField === "avgPrice" &&
                      editingId === item._id ? (
                          renderFieldEditor(item, "avgPrice")
                      ) : (
                          <span>
                              Avg: Rs.{" "}
                              {editingId === item._id
                                  ? editValues.avgPrice
                                  : item.avgPrice}
                          </span>
                      )}

                      {changeEditIcon(item._id, "avgPrice")}

                  </div>

                  <div className="field-container">

                      {activeField === "maxPrice" &&
                      editingId === item._id ? (
                          renderFieldEditor(item, "maxPrice")
                      ) : (
                          <span>
                              Max: Rs.{" "}
                              {editingId === item._id
                                  ? editValues.maxPrice
                                  : item.maxPrice}
                          </span>
                      )}

                      {changeEditIcon(item._id, "maxPrice")}

                  </div>

              </div>

              {editingId !== item._id && (
                  <button
                      className="edit-button"
                      onClick={() => handleEdit(item._id)}
                  >
                      Edit
                  </button>
              )}

              {editingId === item._id && (
                  <div className="edit-buttons">

                      <button
                          className="confirm-button"
                          onClick={() => handleConfirm(item._id)}
                      >
                          Confirm
                      </button>

                      <button
                          className="discard-button"
                          onClick={handleDiscard}
                      >
                          Discard
                      </button>

                  </div>
              )}

              <div className="status-row">

                  <div
                      className={`availability-chip ${
                          item.available ? "yes" : "no"
                      }`}
                  >
                      {item.available
                          ? "Available today"
                          : "Not available"}
                  </div>

                  <div
                      className={`approve-button ${
                          item.status
                              ? "approved"
                              : "not-approved"
                      }`}
                      onClick={() => approveItem(item._id)}
                  >
                      {item.status
                          ? "Approved"
                          : "Approve"}
                  </div>

              </div>

          </div>

      </div>
  );

  return (
      <div>

          <SearchSort
              placeholder="Search by name, price, approved, available..."
              query={query}
              onQuery={setQuery}
              sort={sort}
              onSort={setSort}
              sortOptions={ITEM_SORT_OPTIONS}
          />

          <Pagination page={currentPage} totalPages={totalPages} onPage={goToPage} />

          {/* Existing items */}
          {existingItems.map(renderItem)}

          {/* New items */}
          {newItems.length > 0 && (
              <>
                  <h2 className="new-heading">
                      New
                  </h2>

                  {newItems.map(renderItem)}
              </>
          )}

          <Pagination page={currentPage} totalPages={totalPages} onPage={goToPage} />

      </div>
  );
};

export default Add;