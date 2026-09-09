import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import axios from 'axios';
import './Edit.css';
import editIconImg from '../../assets/edit-icon.png';

const Edit = () => {
  const url = "http://localhost:4000";

  const [list, setList] = useState([]);

  // Which item is currently being edited
  const [editingId, setEditingId] = useState(null);

  // Which field of that item is currently being edited
  const [activeField, setActiveField] = useState(null);

  // Temporary values before Confirm is clicked
  const [editValues, setEditValues] = useState({});

  // Selected image file
  const [imageFile, setImageFile] = useState(null);

  const fetchList = async () => {
    try {
      const response = await axios.get(`${url}/api/items/list-approved`);

      console.log(response.data);

      if (response.data.success) {
        // Only keep items with status === true
        const approvedItems = response.data.data.filter(
          (item) => item.status === true
        );
        setList(approvedItems);
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

  // --------------------------------------------------
  // START EDITING AN ITEM
  // --------------------------------------------------
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

  // --------------------------------------------------
  // DISCARD ALL CHANGES
  // --------------------------------------------------
  const handleDiscard = () => {
    setEditingId(null);
    setActiveField(null);
    setEditValues({});
    setImageFile(null);
  };

  // --------------------------------------------------
  // EDIT ICON
  // --------------------------------------------------
  function changeEditIcon(id, field) {
    if (editingId === id) {
      return (
        <button
          className="edit-button-image"
          onClick={() => changeHandler(id, field)}
        >
          <img
            src={editIconImg}
            className="edit-image"
            alt="Edit"
          />
        </button>
      );
    }
    return null;
  }

  // --------------------------------------------------
  // FIELD EDIT HANDLER
  // --------------------------------------------------
  function changeHandler(id, field) {
    setActiveField(field);
  }

  // --------------------------------------------------
  // CONFIRM & PATCH TO DATABASE
  // --------------------------------------------------
  const handleConfirm = async (id) => {
    try {
      const formData = new FormData();
      formData.append("nameEng", editValues.nameEng);
      formData.append("nameNep", editValues.nameNep);
      formData.append("minPrice", editValues.minPrice);
      formData.append("avgPrice", editValues.avgPrice);
      formData.append("maxPrice", editValues.maxPrice);

      if (imageFile) {
        formData.append("image", imageFile);
      }

      // Do not set Content-Type manually — browser sets multipart boundary
      const response = await axios.patch(
        `${url}/api/items/edit/${id}`,
        formData
      );

      if (response.data.success) {
        const updatedItem = response.data.data;

        setList((prevList) =>
          prevList.map((item) => (item._id === id ? updatedItem : item))
        );

        toast.success("Item updated successfully");
        handleDiscard();
      } else {
        toast.error("Failed to update item");
      }
    } catch (error) {
      console.error("UPDATE ERROR:", error);
      toast.error(error.response?.data?.message || "Error updating item");
    }
  };

  // --------------------------------------------------
  // HANDLE TEXT / NUMBER CHANGES
  // --------------------------------------------------
  const handleInputChange = (field, value) => {
    setEditValues((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  // --------------------------------------------------
  // HANDLE IMAGE SELECTION
  // --------------------------------------------------
  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setImageFile(file);
  };

  // --------------------------------------------------
  // RENDER FIELD INPUT
  // --------------------------------------------------
  const renderFieldEditor = (item, field) => {
    if (editingId !== item._id || activeField !== field) {
      return null;
    }

    // IMAGE
    if (field === "image") {
      return (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 10,
          }}
        >
          <label
            style={{
              cursor: "pointer",
              backgroundColor: "white",
              border: "1px solid #777",
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "12px",
              color: "black",
            }}
          >
            Choose File
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              style={{ display: "none" }}
            />
          </label>
        </div>
      );
    }

    // NAME FIELDS
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

    // PRICE FIELDS
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

  return (
    <div>
      {list.map((item) => (
        <div className="item-container" key={item._id}>
          {/* IMAGE */}
          <div className="image-container" style={{ position: "relative" }}>
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
            {/* NAMES */}
            <div className="name-row">
              <div className="field-container">
                {activeField === "nameEng" && editingId === item._id ? (
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
                {activeField === "nameNep" && editingId === item._id ? (
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

            {/* PRICES */}
            <div className="price">
              <div>Prices:</div>

              <div className="field-container">
                {activeField === "minPrice" && editingId === item._id ? (
                  renderFieldEditor(item, "minPrice")
                ) : (
                  <span>
                    Min: NRs.{" "}
                    {editingId === item._id
                      ? editValues.minPrice
                      : item.minPrice}
                  </span>
                )}
                {changeEditIcon(item._id, "minPrice")}
              </div>

              <div className="field-container">
                {activeField === "avgPrice" && editingId === item._id ? (
                  renderFieldEditor(item, "avgPrice")
                ) : (
                  <span>
                    Avg: NRs.{" "}
                    {editingId === item._id
                      ? editValues.avgPrice
                      : item.avgPrice}
                  </span>
                )}
                {changeEditIcon(item._id, "avgPrice")}
              </div>

              <div className="field-container">
                {activeField === "maxPrice" && editingId === item._id ? (
                  renderFieldEditor(item, "maxPrice")
                ) : (
                  <span>
                    Max: NRs.{" "}
                    {editingId === item._id
                      ? editValues.maxPrice
                      : item.maxPrice}
                  </span>
                )}
                {changeEditIcon(item._id, "maxPrice")}
              </div>
            </div>

            {/* NORMAL EDIT BUTTON */}
            {editingId !== item._id && (
              <button
                className="edit-button"
                onClick={() => handleEdit(item._id)}
              >
                Edit
              </button>
            )}

            {/* CONFIRM / DISCARD */}
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
          </div>
        </div>
      ))}
    </div>
  );
};

export default Edit;